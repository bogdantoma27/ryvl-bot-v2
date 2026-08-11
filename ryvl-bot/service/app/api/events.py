import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.event_service import (
    cancel_event,
    close_event,
    create_series,
    delete_event_permanently,
    edit_event,
    get_event,
    list_series,
    mark_event_open_with_message,
    publish_draft_series,
    update_draft_series,
    remove_vote,
    reschedule_event,
    set_vote,
)
from app.audit import record_audit_log
from app.event_runtime import get_event_revision
from app.auth import SessionUser, require_admin_session
from app.config import get_settings
from app.db import get_db
from app.schemas import (
    EventCreateRequest,
    EventEditRequest,
    EventOccurrenceView,
    EventRescheduleRequest,
    EventSeriesView,
    EventVoteRequest,
)

router = APIRouter(prefix="/api/admin/events", tags=["events"], dependencies=[Depends(require_admin_session)])
settings = get_settings()


@router.get("/stream")
async def stream_event_updates(request: Request):
    async def event_stream():
      last_revision = get_event_revision()
      yield f"event: event-update\ndata: {json.dumps({'revision': last_revision})}\n\n"
      while True:
          if await request.is_disconnected():
              break
          revision = get_event_revision()
          if revision != last_revision:
              last_revision = revision
              yield f"event: event-update\ndata: {json.dumps({'revision': revision})}\n\n"
          await asyncio.sleep(2)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


async def _sync_discord_message(request: Request, db: Session, event: dict) -> None:
    bot = getattr(request.app.state, "discord_bot", None)
    if bot is None or not bot.is_ready():
        return
    if hasattr(bot, "sync_event"):
        await bot.sync_event(db, event)


@router.post("/events", response_model=EventSeriesView)
async def create_event_series(
    payload: EventCreateRequest,
    request: Request,
    user: SessionUser = Depends(require_admin_session),
    db: Session = Depends(get_db),
):
    try:
        if not settings.discord_guild_id:
            raise HTTPException(status_code=500, detail="DISCORD_GUILD_ID is not configured")
        series = create_series(db, payload, guild_id=settings.discord_guild_id, created_by_discord_id=user.user_id)

        first_events = [event for event in series.get("events", []) if event.get("batch_number") == 1]
        bot = getattr(request.app.state, "discord_bot", None)
        if (
            first_events
            and bot is not None
            and bot.is_ready()
            and all(event.get("publish_at") is not None and event["publish_at"] <= datetime.now(timezone.utc) for event in first_events)
        ):
            if hasattr(bot, "post_event_message"):
                mention_role_ids = list(payload.mention_role_ids or [])

                for event in first_events:
                    message = await bot.post_event_message(
                        channel_id=int(series["channel_id"]),
                        series=series,
                        event=event,
                        mention_role_ids=mention_role_ids,
                    )
                    opened = mark_event_open_with_message(db, int(event["id"]), str(message.id))
                    event["message_id"] = str(message.id)
                    event["status"] = opened["status"]

        record_audit_log(
            db,
            action="attendance.create_series",
            entity_type="event_series",
            entity_id=str(series["id"]),
            actor_discord_id=user.user_id,
            details={"channel_id": series["channel_id"], "title": series["title"], "status": series["status"]},
        )

        return series
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/events", response_model=list[EventSeriesView])
def list_event_series(db: Session = Depends(get_db)):
    if not settings.discord_guild_id:
        raise HTTPException(status_code=500, detail="DISCORD_GUILD_ID is not configured")
    return list_series(db, settings.discord_guild_id)


@router.get("/drafts", response_model=list[EventSeriesView])
def list_attendance_drafts(db: Session = Depends(get_db)):
    return [item for item in list_series(db, settings.discord_guild_id) if item.get("status") == "draft"]


@router.get("/recurring", response_model=list[EventSeriesView])
def list_recurring_attendance(db: Session = Depends(get_db)):
    return [item for item in list_series(db, settings.discord_guild_id) if item.get("recurrence") == "weekly" and item.get("status") == "active"]


@router.post("/series/{series_id}/publish", response_model=EventSeriesView)
async def publish_attendance_draft(series_id: int, request: Request, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
    try:
        series = publish_draft_series(db, series_id)
        first_events = [event for event in series.get("events", []) if event.get("batch_number") == 1]
        bot = getattr(request.app.state, "discord_bot", None)
        if bot is not None and bot.is_ready() and hasattr(bot, "post_event_message"):
            for event in first_events:
                message = await bot.post_event_message(
                    channel_id=int(series["channel_id"]),
                    series=series,
                    event=event,
                    mention_role_ids=series.get("mention_role_ids") or [],
                )
                mark_event_open_with_message(db, int(event["id"]), str(message.id))
        record_audit_log(db, action="attendance.publish_draft", entity_type="event_series", entity_id=str(series_id), actor_discord_id=user.user_id)
        return series
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.put("/series/{series_id}/draft", response_model=EventSeriesView)
def update_attendance_draft(series_id: int, payload: EventCreateRequest, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
    try:
        updated = update_draft_series(db, series_id, payload)
        record_audit_log(db, action="attendance.update_draft", entity_type="event_series", entity_id=str(series_id), actor_discord_id=user.user_id)
        return updated
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/events/{event_id}/votes", response_model=EventOccurrenceView)
async def set_attendance_vote(event_id: int, payload: EventVoteRequest, request: Request, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
    try:
        event = set_vote(db, event_id, payload)
        await _sync_discord_message(request, db, event)
        record_audit_log(db, action="attendance.set_vote", entity_type="attendance_event", entity_id=str(event_id), actor_discord_id=user.user_id, details={"user_discord_id": payload.user_discord_id, "status": payload.status})
        return event
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/events/{event_id}/votes/{user_discord_id}", response_model=EventOccurrenceView)
async def remove_attendance_vote(event_id: int, user_discord_id: str, request: Request, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
    try:
        event = remove_vote(db, event_id, user_discord_id)
        await _sync_discord_message(request, db, event)
        record_audit_log(db, action="attendance.remove_vote", entity_type="attendance_event", entity_id=str(event_id), actor_discord_id=user.user_id, details={"user_discord_id": user_discord_id})
        return event
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/events/{event_id}/reschedule", response_model=EventOccurrenceView)
async def reschedule_attendance_event(event_id: int, payload: EventRescheduleRequest, request: Request, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
    try:
        event = reschedule_event(db, event_id, payload)
        await _sync_discord_message(request, db, event)
        record_audit_log(db, action="attendance.reschedule", entity_type="attendance_event", entity_id=str(event_id), actor_discord_id=user.user_id, details={"scope": payload.scope, "starts_at": payload.starts_at.isoformat(), "publish_time": payload.publish_time})
        return event
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/events/{event_id}/edit", response_model=EventOccurrenceView)
async def edit_attendance_event(event_id: int, payload: EventEditRequest, request: Request, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
    try:
        event = edit_event(db, event_id, payload)
        await _sync_discord_message(request, db, event)
        record_audit_log(db, action="attendance.edit", entity_type="attendance_event", entity_id=str(event_id), actor_discord_id=user.user_id, details={"scope": payload.scope, "starts_at": payload.starts_at.isoformat(), "publish_time": payload.publish_time})
        if payload.vote_updates:
            record_audit_log(db, action="attendance.update_votes", entity_type="attendance_event", entity_id=str(event_id), actor_discord_id=user.user_id, details={"votes": len(payload.vote_updates)})
        return event
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/events/{event_id}/close", response_model=EventOccurrenceView)
async def close_attendance_event(event_id: int, request: Request, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
    try:
        event = close_event(db, event_id)
        await _sync_discord_message(request, db, event)
        record_audit_log(db, action="attendance.close", entity_type="attendance_event", entity_id=str(event_id), actor_discord_id=user.user_id)
        return event
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/events/{event_id}/cancel", response_model=EventOccurrenceView)
async def cancel_attendance_event(event_id: int, request: Request, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
    try:
        before_cancel = get_event(db, event_id)
        bot = getattr(request.app.state, "discord_bot", None)
        if bot is not None and bot.is_ready() and hasattr(bot, "delete_attendance_message"):
            await bot.delete_attendance_message(db, before_cancel)
        event = cancel_event(db, event_id)
        record_audit_log(db, action="attendance.cancel", entity_type="attendance_event", entity_id=str(event_id), actor_discord_id=user.user_id)
        return event
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.delete("/events/{event_id}")
def delete_attendance_event(event_id: int, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
    try:
        delete_event_permanently(db, event_id)
        record_audit_log(db, action="attendance.delete_permanent", entity_type="attendance_event", entity_id=str(event_id), actor_discord_id=user.user_id)
        return {"ok": True}
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
