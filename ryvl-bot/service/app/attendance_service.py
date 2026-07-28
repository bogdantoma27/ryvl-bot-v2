from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.attendance_runtime import bump_attendance_revision
from app.models import AttendanceEvent, AttendanceSeries, AttendanceVote, EventStatus, RecurrenceType
from app.schemas import AttendanceCreateRequest, AttendanceEditRequest, AttendanceRescheduleRequest, AttendanceVoteRequest


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _revision_timestamp(event: AttendanceEvent) -> datetime:
    revision = event.updated_at or event.created_at
    if revision.tzinfo is None:
        return revision.replace(tzinfo=timezone.utc)
    return revision.astimezone(timezone.utc)


def _next_week(dt: datetime) -> datetime:
    return dt + timedelta(days=7)


def _event_to_dict(event: AttendanceEvent) -> dict:
    return {
        "id": event.id,
        "series_id": event.series_id,
        "occurrence_number": event.occurrence_number,
        "starts_at": _as_utc(event.starts_at),
        "closes_at": _as_utc(event.closes_at),
        "status": event.status,
        "message_id": event.message_id,
        "updated_at": _as_utc(event.updated_at),
        "votes": [
            {
                "user_discord_id": vote.user_discord_id,
                "display_name": vote.display_name,
                "status": vote.status,
                "updated_at": _as_utc(vote.updated_at),
            }
            for vote in sorted(event.votes, key=lambda item: item.updated_at)
        ],
    }


def _series_to_dict(series: AttendanceSeries) -> dict:
    return {
        "id": series.id,
        "guild_id": series.guild_id,
        "channel_id": series.channel_id,
        "title": series.title,
        "description": series.description,
        "timezone": series.timezone,
        "recurrence": series.recurrence,
        "repeat_count": series.repeat_count,
        "created_by_discord_id": series.created_by_discord_id,
        "events": [_event_to_dict(event) for event in sorted(series.events, key=lambda item: item.occurrence_number)],
    }


def _apply_vote_updates(event: AttendanceEvent, vote_updates: list[AttendanceVoteRequest]) -> bool:
    desired_votes = {item.user_discord_id: item for item in vote_updates}
    current_votes = {vote.user_discord_id: vote for vote in event.votes}
    changed = False

    for user_discord_id, payload in desired_votes.items():
        vote = current_votes.get(user_discord_id)
        if vote is None:
            event.votes.append(
                AttendanceVote(
                    event_id=event.id,
                    user_discord_id=payload.user_discord_id,
                    display_name=payload.display_name,
                    status=payload.status,
                    updated_at=datetime.now(timezone.utc),
                )
            )
            changed = True
            continue

        if vote.display_name != payload.display_name or vote.status != payload.status:
            vote.display_name = payload.display_name
            vote.status = payload.status
            vote.updated_at = datetime.now(timezone.utc)
            changed = True

    for user_discord_id, vote in list(current_votes.items()):
        if user_discord_id not in desired_votes:
            event.votes.remove(vote)
            changed = True

    return changed


def _touch_revision() -> None:
    try:
        import asyncio

        asyncio.get_running_loop()
        asyncio.create_task(bump_attendance_revision())
    except RuntimeError:
        pass


def create_series(db: Session, payload: AttendanceCreateRequest, guild_id: str, created_by_discord_id: str = "system") -> dict:
    starts_at_utc = _as_utc(payload.starts_at)
    if starts_at_utc <= datetime.now(timezone.utc):
        raise ValueError("starts_at must be in the future")

    repeat_count = payload.repeat_count
    if payload.recurrence == RecurrenceType.NONE:
        repeat_count = 1
    elif repeat_count is None:
        repeat_count = 8

    series = AttendanceSeries(
        guild_id=guild_id,
        channel_id=payload.channel_id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        timezone=payload.timezone,
        recurrence=payload.recurrence,
        repeat_count=payload.repeat_count,
        created_by_discord_id=created_by_discord_id,
    )
    db.add(series)
    db.flush()

    start = starts_at_utc
    for occurrence_number in range(1, int(repeat_count) + 1):
        if occurrence_number > 1:
            start = _next_week(start)
        event = AttendanceEvent(
            series_id=series.id,
            occurrence_number=occurrence_number,
            starts_at=start,
            closes_at=start,
            status=EventStatus.SCHEDULED,
        )
        db.add(event)

    db.commit()
    _touch_revision()
    db.refresh(series)
    series = db.execute(
        select(AttendanceSeries)
        .where(AttendanceSeries.id == series.id)
        .options(selectinload(AttendanceSeries.events).selectinload(AttendanceEvent.votes))
    ).scalar_one()
    return _series_to_dict(series)


def list_series(db: Session, guild_id: str) -> list[dict]:
    items = db.execute(
        select(AttendanceSeries)
        .where(AttendanceSeries.guild_id == guild_id)
        .options(selectinload(AttendanceSeries.events).selectinload(AttendanceEvent.votes))
    ).scalars().all()
    return [_series_to_dict(item) for item in items]


def get_event(db: Session, event_id: int) -> dict:
    event = db.execute(
        select(AttendanceEvent)
        .where(AttendanceEvent.id == event_id)
        .options(selectinload(AttendanceEvent.votes))
    ).scalar_one_or_none()
    if event is None:
        raise LookupError("event not found")
    return _event_to_dict(event)


def set_vote(db: Session, event_id: int, payload: AttendanceVoteRequest) -> dict:
    event = db.get(AttendanceEvent, event_id)
    if event is None:
        raise LookupError("event not found")
    if event.status in {EventStatus.CLOSED, EventStatus.CANCELLED}:
        raise ValueError("event is closed")

    vote = db.execute(
        select(AttendanceVote).where(
            AttendanceVote.event_id == event_id,
            AttendanceVote.user_discord_id == payload.user_discord_id,
        )
    ).scalar_one_or_none()
    if vote is None:
        vote = AttendanceVote(
            event_id=event_id,
            user_discord_id=payload.user_discord_id,
            display_name=payload.display_name,
            status=payload.status,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(vote)
    else:
        vote.display_name = payload.display_name
        vote.status = payload.status
        vote.updated_at = datetime.now(timezone.utc)
    event.updated_at = datetime.now(timezone.utc)

    db.commit()
    _touch_revision()

    event = db.execute(
        select(AttendanceEvent)
        .where(AttendanceEvent.id == event_id)
        .options(selectinload(AttendanceEvent.votes))
    ).scalar_one()
    return _event_to_dict(event)


def remove_vote(db: Session, event_id: int, user_discord_id: str) -> dict:
    event = db.get(AttendanceEvent, event_id)
    if event is None:
        raise LookupError("event not found")
    if event.status in {EventStatus.CLOSED, EventStatus.CANCELLED}:
        raise ValueError("event is closed")

    vote = db.execute(
        select(AttendanceVote).where(
            AttendanceVote.event_id == event_id,
            AttendanceVote.user_discord_id == user_discord_id,
        )
    ).scalar_one_or_none()
    if vote is not None:
        db.delete(vote)
        event.updated_at = datetime.now(timezone.utc)
        db.commit()
        _touch_revision()

    event = db.execute(
        select(AttendanceEvent)
        .where(AttendanceEvent.id == event_id)
        .options(selectinload(AttendanceEvent.votes))
    ).scalar_one()
    return _event_to_dict(event)


def close_event(db: Session, event_id: int) -> dict:
    event = db.get(AttendanceEvent, event_id)
    if event is None:
        raise LookupError("event not found")
    event.status = EventStatus.CLOSED
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    _touch_revision()
    event = db.execute(
        select(AttendanceEvent)
        .where(AttendanceEvent.id == event_id)
        .options(selectinload(AttendanceEvent.votes))
    ).scalar_one()
    return _event_to_dict(event)


def cancel_event(db: Session, event_id: int) -> dict:
    event = db.get(AttendanceEvent, event_id)
    if event is None:
        raise LookupError("event not found")
    event.status = EventStatus.CANCELLED
    event.message_id = None
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    _touch_revision()
    event = db.execute(
        select(AttendanceEvent)
        .where(AttendanceEvent.id == event_id)
        .options(selectinload(AttendanceEvent.votes))
    ).scalar_one()
    return _event_to_dict(event)


def cancel_event_by_message_id(db: Session, message_id: str) -> dict | None:
    event = db.execute(
        select(AttendanceEvent)
        .where(AttendanceEvent.message_id == message_id)
        .options(selectinload(AttendanceEvent.votes))
    ).scalar_one_or_none()
    if event is None:
        return None

    event.status = EventStatus.CANCELLED
    event.message_id = None
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    _touch_revision()

    refreshed = db.execute(
        select(AttendanceEvent)
        .where(AttendanceEvent.id == event.id)
        .options(selectinload(AttendanceEvent.votes))
    ).scalar_one()
    return _event_to_dict(refreshed)


def edit_event(db: Session, event_id: int, payload: AttendanceEditRequest) -> dict:
    event = db.execute(
        select(AttendanceEvent)
        .where(AttendanceEvent.id == event_id)
        .options(selectinload(AttendanceEvent.votes))
    ).scalar_one_or_none()
    if event is None:
        raise LookupError("event not found")
    if event.status in {EventStatus.CLOSED, EventStatus.CANCELLED}:
        raise ValueError("event is closed")

    series = db.get(AttendanceSeries, int(event.series_id))
    if series is None:
        raise LookupError("series not found")

    if payload.expected_updated_at is not None and _revision_timestamp(event) != _as_utc(payload.expected_updated_at):
        raise ValueError("event changed by another admin, refresh and try again")

    new_start = _as_utc(payload.starts_at)
    if new_start <= datetime.now(timezone.utc):
        raise ValueError("cannot move kickoff to the past; choose a future date and time")

    series.title = payload.title.strip()
    series.description = payload.description.strip()
    series.timezone = payload.timezone.strip() or "Europe/Bucharest"

    if payload.scope == "this_occurrence_only":
        event.starts_at = new_start
        event.closes_at = new_start
        event.updated_at = datetime.now(timezone.utc)
    else:
        current_delta = new_start - event.starts_at
        following = db.execute(
            select(AttendanceEvent)
            .where(
                AttendanceEvent.series_id == event.series_id,
                AttendanceEvent.occurrence_number >= event.occurrence_number,
                AttendanceEvent.status.not_in([EventStatus.CLOSED, EventStatus.CANCELLED]),
            )
        ).scalars().all()
        for row in following:
            row.starts_at = row.starts_at + current_delta
            row.closes_at = row.starts_at
            row.updated_at = datetime.now(timezone.utc)

    if payload.vote_updates:
        if _apply_vote_updates(event, payload.vote_updates):
            event.updated_at = datetime.now(timezone.utc)

    if event.updated_at is None:
        event.updated_at = datetime.now(timezone.utc)

    db.commit()
    _touch_revision()
    refreshed = db.execute(
        select(AttendanceEvent)
        .where(AttendanceEvent.id == event_id)
        .options(selectinload(AttendanceEvent.votes))
    ).scalar_one()
    return _event_to_dict(refreshed)


def delete_event_permanently(db: Session, event_id: int) -> None:
    event = db.get(AttendanceEvent, event_id)
    if event is None:
        raise LookupError("event not found")
    if event.status != EventStatus.CANCELLED:
        raise ValueError("only cancelled events can be permanently deleted")
    db.delete(event)
    db.commit()
    _touch_revision()


def reschedule_event(db: Session, event_id: int, payload: AttendanceRescheduleRequest) -> dict:
    event = db.get(AttendanceEvent, event_id)
    if event is None:
        raise LookupError("event not found")
    if event.status in {EventStatus.CLOSED, EventStatus.CANCELLED}:
        raise ValueError("event is closed")

    new_start = _as_utc(payload.starts_at)
    if new_start <= datetime.now(timezone.utc):
        raise ValueError("cannot move kickoff to the past; choose a future date and time")

    if payload.scope == "this_occurrence_only":
        event.starts_at = new_start
        event.closes_at = new_start
        db.commit()
        db.refresh(event)
        event = db.execute(
            select(AttendanceEvent)
            .where(AttendanceEvent.id == event.id)
            .options(selectinload(AttendanceEvent.votes))
        ).scalar_one()
        return _event_to_dict(event)

    current_delta = new_start - event.starts_at
    following = db.execute(
        select(AttendanceEvent)
        .where(
            AttendanceEvent.series_id == event.series_id,
            AttendanceEvent.occurrence_number >= event.occurrence_number,
            AttendanceEvent.status.not_in([EventStatus.CLOSED, EventStatus.CANCELLED]),
        )
    ).scalars().all()

    for row in following:
        row.starts_at = row.starts_at + current_delta
        row.closes_at = row.starts_at

    db.commit()
    db.refresh(event)
    event = db.execute(
        select(AttendanceEvent)
        .where(AttendanceEvent.id == event.id)
        .options(selectinload(AttendanceEvent.votes))
    ).scalar_one()
    return _event_to_dict(event)


def close_due_events(db: Session) -> list[int]:
    now = datetime.now(timezone.utc)
    due = db.execute(
        select(AttendanceEvent).where(
            AttendanceEvent.status.in_([EventStatus.SCHEDULED, EventStatus.OPEN]),
            AttendanceEvent.closes_at <= now,
        )
    ).scalars().all()

    ids: list[int] = []
    for event in due:
        event.status = EventStatus.CLOSED
        ids.append(event.id)

    if ids:
        db.commit()

    return ids


def set_event_message_id(db: Session, event_id: int, message_id: str) -> None:
    event = db.get(AttendanceEvent, event_id)
    if event is None:
        raise LookupError("event not found")
    event.message_id = message_id
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
