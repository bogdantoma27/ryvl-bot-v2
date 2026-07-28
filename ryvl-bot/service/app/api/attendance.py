import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.attendance_service import (
    cancel_event,
    close_event,
    create_series,
    delete_event_permanently,
    edit_event,
    get_event,
    list_series,
    mark_event_open_with_message,
    remove_vote,
    reschedule_event,
    set_vote,
)
from app.audit import record_audit_log
from app.attendance_runtime import get_attendance_revision
from app.auth import SessionUser, require_admin_session
from app.config import get_settings
from app.db import get_db
from app.runtime_settings import get_runtime_settings
from app.schemas import (
    AttendanceCreateRequest,
    AttendanceEditRequest,
    AttendanceEventView,
    AttendanceRescheduleRequest,
    AttendanceSeriesView,
    AttendanceVoteRequest,
)

router = APIRouter(prefix="/api/admin/attendance", tags=["attendance"], dependencies=[Depends(require_admin_session)])
settings = get_settings()


@router.get("/stream")
async def stream_attendance_updates(request: Request):
    async def event_stream():
      last_revision = get_attendance_revision()
      yield f"event: attendance-update\ndata: {json.dumps({'revision': last_revision})}\n\n"
      while True:
          if await request.is_disconnected():
              break
          revision = get_attendance_revision()
          if revision != last_revision:
              last_revision = revision
              yield f"event: attendance-update\ndata: {json.dumps({'revision': revision})}\n\n"
          await asyncio.sleep(2)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


async def _sync_discord_message(request: Request, db: Session, event: dict) -> None:
    bot = getattr(request.app.state, "discord_bot", None)
    if bot is None or not bot.is_ready():
        return
    if hasattr(bot, "sync_attendance_event"):
        await bot.sync_attendance_event(db, event)


@router.post("/events", response_model=AttendanceSeriesView)
async def create_attendance_series(
    payload: AttendanceCreateRequest,
    request: Request,
    user: SessionUser = Depends(require_admin_session),
    db: Session = Depends(get_db),
):
    try:
        if not settings.discord_guild_id:
            raise HTTPException(status_code=500, detail="DISCORD_GUILD_ID is not configured")
        series = create_series(db, payload, guild_id=settings.discord_guild_id, created_by_discord_id=user.user_id)

        runtime = get_runtime_settings(db, settings)
        first_event = next((event for event in series.get("events", []) if event.get("occurrence_number") == 1), None)
        bot = getattr(request.app.state, "discord_bot", None)
        if (
            first_event
            and bot is not None
            and bot.is_ready()
            and first_event.get("publish_at") is not None
            and first_event["publish_at"] <= datetime.now(timezone.utc)
        ):
            if hasattr(bot, "post_attendance_message"):
                mention_role_ids = list(payload.mention_role_ids or [])
                if (
                    not mention_role_ids
                    and runtime["default_attendance_channel_id"]
                    and str(series["channel_id"]) == str(runtime["default_attendance_channel_id"])
                ):
                    mention_role_ids = list(runtime["default_attendance_role_ids"] or [])

                message = await bot.post_attendance_message(
                    channel_id=int(series["channel_id"]),
                    series=series,
                    event=first_event,
                    mention_role_ids=mention_role_ids,
                )
                opened = mark_event_open_with_message(db, int(first_event["id"]), str(message.id))

                # Keep API response aligned with the stored value.
                first_event["message_id"] = str(message.id)
                first_event["status"] = opened["status"]

            record_audit_log(
                db,
                action="attendance.create_series",
                entity_type="attendance_series",
                entity_id=str(series["id"]),
                actor_discord_id=user.user_id,
                details={"channel_id": series["channel_id"], "title": series["title"], "publish_time": payload.publish_time},
            )

        return series
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/events", response_model=list[AttendanceSeriesView])
def list_attendance_series(db: Session = Depends(get_db)):
    if not settings.discord_guild_id:
        raise HTTPException(status_code=500, detail="DISCORD_GUILD_ID is not configured")
    return list_series(db, settings.discord_guild_id)


@router.post("/events/{event_id}/votes", response_model=AttendanceEventView)
async def set_attendance_vote(event_id: int, payload: AttendanceVoteRequest, request: Request, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
    try:
        event = set_vote(db, event_id, payload)
        await _sync_discord_message(request, db, event)
        record_audit_log(db, action="attendance.set_vote", entity_type="attendance_event", entity_id=str(event_id), actor_discord_id=user.user_id, details={"user_discord_id": payload.user_discord_id, "status": payload.status})
        return event
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/events/{event_id}/votes/{user_discord_id}", response_model=AttendanceEventView)
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


@router.post("/events/{event_id}/reschedule", response_model=AttendanceEventView)
async def reschedule_attendance_event(event_id: int, payload: AttendanceRescheduleRequest, request: Request, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
    try:
        event = reschedule_event(db, event_id, payload)
        await _sync_discord_message(request, db, event)
        record_audit_log(db, action="attendance.reschedule", entity_type="attendance_event", entity_id=str(event_id), actor_discord_id=user.user_id, details={"scope": payload.scope, "starts_at": payload.starts_at.isoformat(), "publish_time": payload.publish_time})
        return event
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/events/{event_id}/edit", response_model=AttendanceEventView)
async def edit_attendance_event(event_id: int, payload: AttendanceEditRequest, request: Request, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
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


@router.post("/events/{event_id}/close", response_model=AttendanceEventView)
async def close_attendance_event(event_id: int, request: Request, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
    try:
        event = close_event(db, event_id)
        await _sync_discord_message(request, db, event)
        record_audit_log(db, action="attendance.close", entity_type="attendance_event", entity_id=str(event_id), actor_discord_id=user.user_id)
        return event
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/events/{event_id}/cancel", response_model=AttendanceEventView)
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
