import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.event_runtime import bump_event_revision
from app.models import (
    EventOccurrence,
    EventSeries,
    EventVote,
    EventSeriesStatus,
    EventStatus,
    PostTimingMode,
    RecurrenceType,
    RecurrenceEndsMode,
)
from app.schemas import EventCreateRequest, EventEditRequest, EventRescheduleRequest, EventVoteRequest


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _revision_timestamp(event: EventOccurrence) -> datetime:
    revision = event.updated_at or event.created_at
    if revision.tzinfo is None:
        return revision.replace(tzinfo=timezone.utc)
    return revision.astimezone(timezone.utc)


def _next_week(dt: datetime) -> datetime:
    return dt + timedelta(days=7)


def _normalized_weekdays(payload: EventCreateRequest, kickoff_at: datetime) -> list[int]:
    if payload.recurrence == RecurrenceType.NONE:
        return [kickoff_at.astimezone(ZoneInfo(payload.timezone)).weekday()]
    values = sorted({int(value) for value in payload.weekdays})
    if not values:
        return [kickoff_at.astimezone(ZoneInfo(payload.timezone)).weekday()]
    if any(value < 0 or value > 6 for value in values):
        raise ValueError("weekdays must contain values from 0 (Monday) to 6 (Sunday)")
    return values


def _offset_minutes(value: str | None) -> int:
    if not value:
        return 0
    try:
        minutes = int(value)
    except ValueError as error:
        raise ValueError("post_timing_value must be a number of minutes") from error
    if minutes < 0 or minutes > 10080:
        raise ValueError("post_timing_value must be between 0 and 10080 minutes")
    return minutes


def _local_occurrence_dates(kickoff_at: datetime, timezone_name: str, weekdays: list[int], batch_number: int) -> list[datetime]:
    try:
        zone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        zone = ZoneInfo("UTC")
    local_kickoff = _as_utc(kickoff_at).astimezone(zone)
    week_start = local_kickoff - timedelta(days=local_kickoff.weekday())
    week_start += timedelta(days=7 * (batch_number - 1))
    dates = []
    for weekday in weekdays:
        local_date = week_start + timedelta(days=weekday)
        local_value = local_date.replace(second=0, microsecond=0)
        dates.append(local_value.astimezone(timezone.utc))
    return dates


def _publish_at_for_mode(
    kickoff_at: datetime,
    mode: str,
    value: str | None,
    *,
    first_batch: bool,
    previous_batch_end: datetime | None = None,
) -> datetime:
    if first_batch:
        return datetime.now(timezone.utc)
    if mode == PostTimingMode.AT_EVENT_START.value:
        return kickoff_at
    if mode == PostTimingMode.BEFORE_EVENT_START.value:
        return kickoff_at - timedelta(minutes=_offset_minutes(value))
    if mode == PostTimingMode.WHEN_PREVIOUS_EVENT_ENDS.value:
        return previous_batch_end or kickoff_at
    if mode == PostTimingMode.AFTER_PREVIOUS_EVENT_ENDS.value:
        return (previous_batch_end or kickoff_at) + timedelta(minutes=_offset_minutes(value))
    return kickoff_at


def _parse_hhmm(value: str) -> tuple[int, int]:
    try:
        hour_raw, minute_raw = value.split(":", 1)
        hour = int(hour_raw)
        minute = int(minute_raw)
    except Exception as error:
        raise ValueError("publish_time must use HH:mm format") from error
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        raise ValueError("publish_time must use HH:mm format")
    return hour, minute


def _publish_at_for_kickoff(kickoff_utc: datetime, timezone_name: str, publish_time: str | None) -> datetime:
    if not publish_time:
        return kickoff_utc

    hour, minute = _parse_hhmm(publish_time.strip())
    try:
        zone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        zone = ZoneInfo("UTC")

    local_kickoff = _as_utc(kickoff_utc).astimezone(zone)
    local_publish = local_kickoff.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return local_publish.astimezone(timezone.utc)


def _publish_time_from_dt(value_utc: datetime, timezone_name: str) -> str:
    try:
        zone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        zone = ZoneInfo("UTC")
    local_value = _as_utc(value_utc).astimezone(zone)
    return f"{local_value.hour:02d}:{local_value.minute:02d}"


def _event_to_dict(event: EventOccurrence) -> dict:
    kickoff_at_utc = _as_utc(event.closes_at)
    publish_at_utc = _as_utc(event.starts_at)
    return {
        "id": event.id,
        "series_id": event.series_id,
        "occurrence_number": event.occurrence_number,
        "batch_number": event.batch_number,
        "weekday": event.weekday,
        "publish_at": publish_at_utc,
        # starts_at is kept as kickoff-at for backward compatibility in API consumers.
        "starts_at": kickoff_at_utc,
        "closes_at": kickoff_at_utc,
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


def _series_to_dict(series: EventSeries) -> dict:
    try:
        weekdays = [int(value) for value in str(series.weekdays or "").split(",") if value != ""]
    except ValueError:
        weekdays = []
    return {
        "id": series.id,
        "guild_id": series.guild_id,
        "channel_id": series.channel_id,
        "title": series.title,
        "description": series.description,
        "timezone": series.timezone,
        "recurrence": series.recurrence,
        "repeat_count": series.repeat_count,
        "anchor_starts_at": _as_utc(series.anchor_starts_at) if series.anchor_starts_at else None,
        "weekdays": weekdays,
        "ends_mode": series.ends_mode,
        "end_date": _as_utc(series.end_date) if series.end_date else None,
        "post_timing_mode": series.post_timing_mode,
        "post_timing_value": series.post_timing_value,
        "mention_role_ids": json.loads(series.mention_role_ids or "[]"),
        "status": series.status,
        "created_by_discord_id": series.created_by_discord_id,
        "events": [_event_to_dict(event) for event in sorted(series.events, key=lambda item: item.occurrence_number)],
    }


def _apply_vote_updates(event: EventOccurrence, vote_updates: list[EventVoteRequest]) -> bool:
    desired_votes = {item.user_discord_id: item for item in vote_updates}
    current_votes = {vote.user_discord_id: vote for vote in event.votes}
    changed = False

    for user_discord_id, payload in desired_votes.items():
        vote = current_votes.get(user_discord_id)
        if vote is None:
            event.votes.append(
                EventVote(
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
        asyncio.create_task(bump_event_revision())
    except RuntimeError:
        pass


def create_series(db: Session, payload: EventCreateRequest, guild_id: str, created_by_discord_id: str = "system") -> dict:
    kickoff_at_utc = _as_utc(payload.starts_at)
    if kickoff_at_utc <= datetime.now(timezone.utc):
        raise ValueError("starts_at must be in the future")

    weekdays = _normalized_weekdays(payload, kickoff_at_utc)
    repeat_count = 1 if payload.recurrence == RecurrenceType.NONE else payload.repeat_count
    if payload.recurrence == RecurrenceType.WEEKLY and repeat_count is not None and repeat_count < 1:
        raise ValueError("repeat_count must be at least 1")
    if payload.ends_mode == RecurrenceEndsMode.AFTER_COUNT and repeat_count is None:
        raise ValueError("repeat_count is required when recurrence ends after a count")
    if payload.ends_mode == RecurrenceEndsMode.ON_DATE and payload.end_date is None:
        raise ValueError("end_date is required when recurrence ends on a date")

    series = EventSeries(
        guild_id=guild_id,
        channel_id=payload.channel_id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        timezone=payload.timezone,
        recurrence=payload.recurrence,
        repeat_count=repeat_count,
        anchor_starts_at=kickoff_at_utc,
        weekdays=','.join(str(value) for value in weekdays),
        ends_mode=payload.ends_mode.value,
        end_date=_as_utc(payload.end_date) if payload.end_date else None,
        post_timing_mode=payload.post_timing_mode.value,
        post_timing_value=payload.post_timing_value or payload.publish_time,
        status=EventSeriesStatus.DRAFT.value if payload.save_as_draft else EventSeriesStatus.ACTIVE.value,
        mention_role_ids=json.dumps(payload.mention_role_ids or []),
        created_by_discord_id=created_by_discord_id,
    )
    db.add(series)
    db.flush()

    if not payload.save_as_draft:
        occurrence_dates = [
            value for value in _local_occurrence_dates(kickoff_at_utc, series.timezone, weekdays, 1)
            if value >= kickoff_at_utc
        ]
        if not occurrence_dates:
            occurrence_dates = _local_occurrence_dates(kickoff_at_utc, series.timezone, weekdays, 2)
            batch_number = 2
        else:
            batch_number = 1
        batch_weekdays = [value.astimezone(ZoneInfo(series.timezone)).weekday() for value in occurrence_dates]
        for index, occurrence_kickoff in enumerate(occurrence_dates, start=1):
            batch_mode = series.post_timing_mode in {
                PostTimingMode.WHEN_PREVIOUS_EVENT_ENDS.value,
                PostTimingMode.AFTER_PREVIOUS_EVENT_ENDS.value,
                PostTimingMode.AT_SPECIFIC_TIME.value,
            }
            publish_at = _publish_at_for_mode(
                occurrence_kickoff,
                series.post_timing_mode if not batch_mode else PostTimingMode.AT_EVENT_START.value,
                series.post_timing_value,
                first_batch=True,
            )
            db.add(EventOccurrence(
                series_id=series.id,
                occurrence_number=index,
                batch_number=batch_number,
                weekday=batch_weekdays[index - 1],
                starts_at=publish_at,
                closes_at=occurrence_kickoff,
                status=EventStatus.SCHEDULED,
            ))

    db.commit()
    _touch_revision()
    db.refresh(series)
    series = db.execute(
        select(EventSeries)
        .where(EventSeries.id == series.id)
        .options(selectinload(EventSeries.events).selectinload(EventOccurrence.votes))
    ).scalar_one()
    return _series_to_dict(series)


def _series_weekdays(series: EventSeries) -> list[int]:
    return sorted({int(value) for value in str(series.weekdays or "").split(",") if value != ""})


def publish_draft_series(db: Session, series_id: int) -> dict:
    series = db.execute(
        select(EventSeries)
        .where(EventSeries.id == series_id)
        .options(selectinload(EventSeries.events).selectinload(EventOccurrence.votes))
    ).scalar_one_or_none()
    if series is None:
        raise LookupError("series not found")
    if series.status != EventSeriesStatus.DRAFT.value:
        raise ValueError("series is not a draft")

    weekdays = _series_weekdays(series)
    occurrence_dates = [
        value for value in _local_occurrence_dates(series.anchor_starts_at, series.timezone, weekdays, 1)
        if value >= _as_utc(series.anchor_starts_at)
    ]
    if not occurrence_dates:
        occurrence_dates = _local_occurrence_dates(series.anchor_starts_at, series.timezone, weekdays, 2)
    series.status = EventSeriesStatus.ACTIVE.value
    for index, occurrence_kickoff in enumerate(occurrence_dates, start=1):
        db.add(EventOccurrence(
            series_id=series.id,
            occurrence_number=index,
            batch_number=1,
            weekday=occurrence_kickoff.astimezone(ZoneInfo(series.timezone)).weekday(),
            starts_at=datetime.now(timezone.utc),
            closes_at=occurrence_kickoff,
            status=EventStatus.SCHEDULED,
        ))
    db.commit()
    _touch_revision()
    return _series_to_dict(db.execute(
        select(EventSeries)
        .where(EventSeries.id == series.id)
        .options(selectinload(EventSeries.events).selectinload(EventOccurrence.votes))
    ).scalar_one())


def update_draft_series(db: Session, series_id: int, payload: EventCreateRequest) -> dict:
    series = db.execute(
        select(EventSeries)
        .where(EventSeries.id == series_id)
        .options(selectinload(EventSeries.events).selectinload(EventOccurrence.votes))
    ).scalar_one_or_none()
    if series is None:
        raise LookupError("series not found")
    if series.status != EventSeriesStatus.DRAFT.value:
        raise ValueError("series is not a draft")

    kickoff_at_utc = _as_utc(payload.starts_at)
    if kickoff_at_utc <= datetime.now(timezone.utc):
        raise ValueError("starts_at must be in the future")
    weekdays = _normalized_weekdays(payload, kickoff_at_utc)
    if payload.ends_mode == RecurrenceEndsMode.AFTER_COUNT and payload.repeat_count is None:
        raise ValueError("repeat_count is required when recurrence ends after a count")
    if payload.ends_mode == RecurrenceEndsMode.ON_DATE and payload.end_date is None:
        raise ValueError("end_date is required when recurrence ends on a date")

    series.channel_id = payload.channel_id
    series.title = payload.title.strip()
    series.description = payload.description.strip()
    series.timezone = payload.timezone
    series.recurrence = payload.recurrence
    series.repeat_count = 1 if payload.recurrence == RecurrenceType.NONE else payload.repeat_count
    series.anchor_starts_at = kickoff_at_utc
    series.weekdays = ','.join(str(value) for value in weekdays)
    series.ends_mode = payload.ends_mode.value
    series.end_date = _as_utc(payload.end_date) if payload.end_date else None
    series.post_timing_mode = payload.post_timing_mode.value
    series.post_timing_value = payload.post_timing_value or payload.publish_time
    series.mention_role_ids = json.dumps(payload.mention_role_ids or [])
    db.commit()
    _touch_revision()
    return _series_to_dict(db.execute(
        select(EventSeries)
        .where(EventSeries.id == series.id)
        .options(selectinload(EventSeries.events).selectinload(EventOccurrence.votes))
    ).scalar_one())


def _specific_time_for_batch(batch_start: datetime, timezone_name: str, value: str | None) -> datetime:
    if not value:
        return batch_start
    raw = value.strip().lower().replace(" ", ",")
    parts = [part for part in raw.split(",") if part]
    if len(parts) != 2:
        raise ValueError("at_specific_time requires weekday and HH:mm, for example sun,18:00")
    weekday_names = {"mon": 0, "monday": 0, "tue": 1, "tuesday": 1, "wed": 2, "wednesday": 2, "thu": 3, "thursday": 3, "fri": 4, "friday": 4, "sat": 5, "saturday": 5, "sun": 6, "sunday": 6}
    try:
        weekday = int(parts[0]) if parts[0].isdigit() else weekday_names[parts[0]]
        hour, minute = _parse_hhmm(parts[1])
    except (KeyError, ValueError) as error:
        raise ValueError("at_specific_time requires weekday and HH:mm, for example sun,18:00") from error
    zone = ZoneInfo(timezone_name)
    local_batch_start = _as_utc(batch_start).astimezone(zone)
    local_anchor = local_batch_start - timedelta(days=local_batch_start.weekday()) + timedelta(days=weekday)
    local_anchor = local_anchor.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return local_anchor.astimezone(timezone.utc)


def _next_batch_publish_at(series: EventSeries, occurrence_kickoff: datetime, batch_start: datetime, previous_end: datetime) -> datetime:
    mode = str(series.post_timing_mode or PostTimingMode.AT_EVENT_START.value)
    if mode == PostTimingMode.WHEN_PREVIOUS_EVENT_ENDS.value:
        return previous_end
    if mode == PostTimingMode.AFTER_PREVIOUS_EVENT_ENDS.value:
        return previous_end + timedelta(minutes=_offset_minutes(series.post_timing_value))
    if mode == PostTimingMode.AT_SPECIFIC_TIME.value:
        return _specific_time_for_batch(batch_start, series.timezone, series.post_timing_value)
    return _publish_at_for_mode(occurrence_kickoff, mode, series.post_timing_value, first_batch=False)


def generate_next_batch(db: Session, series_id: int) -> list[dict]:
    series = db.execute(
        select(EventSeries)
        .where(EventSeries.id == series_id)
        .options(selectinload(EventSeries.events).selectinload(EventOccurrence.votes))
    ).scalar_one_or_none()
    if series is None or series.status != EventSeriesStatus.ACTIVE.value or series.recurrence != RecurrenceType.WEEKLY:
        return []

    current_batch = max((event.batch_number for event in series.events), default=0)
    current_events = [event for event in series.events if event.batch_number == current_batch]
    mode = str(series.post_timing_mode or PostTimingMode.AT_EVENT_START.value)
    waits_for_previous_batch = mode not in {
        PostTimingMode.AT_EVENT_START.value,
        PostTimingMode.BEFORE_EVENT_START.value,
    }
    if not current_events or (
        waits_for_previous_batch
        and any(event.status not in {EventStatus.CLOSED, EventStatus.CANCELLED} for event in current_events)
    ):
        return []
    next_batch = current_batch + 1
    if series.ends_mode == RecurrenceEndsMode.AFTER_COUNT.value and series.repeat_count is not None and next_batch > series.repeat_count:
        series.status = EventSeriesStatus.COMPLETED.value
        db.commit()
        return []

    anchor = max(event.closes_at for event in current_events)
    occurrence_dates = _local_occurrence_dates(anchor, series.timezone, _series_weekdays(series), 2)
    if series.end_date and min(occurrence_dates) > _as_utc(series.end_date):
        series.status = EventSeriesStatus.COMPLETED.value
        db.commit()
        return []

    previous_end = max(_as_utc(event.closes_at) for event in current_events)
    batch_start = min(occurrence_dates)
    if series.post_timing_mode in {
        PostTimingMode.WHEN_PREVIOUS_EVENT_ENDS.value,
        PostTimingMode.AFTER_PREVIOUS_EVENT_ENDS.value,
        PostTimingMode.AT_SPECIFIC_TIME.value,
    }:
        publish_at = _next_batch_publish_at(series, batch_start, batch_start, previous_end)
        if publish_at > datetime.now(timezone.utc):
            return []

    first_occurrence_number = max((event.occurrence_number for event in series.events), default=0) + 1
    created: list[EventOccurrence] = []
    for index, occurrence_kickoff in enumerate(occurrence_dates):
        publish_at = _next_batch_publish_at(series, occurrence_kickoff, batch_start, previous_end)
        event = EventOccurrence(
            series_id=series.id,
            occurrence_number=first_occurrence_number + index,
            batch_number=next_batch,
            weekday=occurrence_kickoff.astimezone(ZoneInfo(series.timezone)).weekday(),
            starts_at=publish_at,
            closes_at=occurrence_kickoff,
            status=EventStatus.SCHEDULED,
        )
        db.add(event)
        created.append(event)

    db.commit()
    _touch_revision()
    return [_event_to_dict(event) for event in created]


def list_series(db: Session, guild_id: str) -> list[dict]:
    items = db.execute(
        select(EventSeries)
        .where(EventSeries.guild_id == guild_id)
        .options(selectinload(EventSeries.events).selectinload(EventOccurrence.votes))
    ).scalars().all()
    return [_series_to_dict(item) for item in items]


def get_event(db: Session, event_id: int) -> dict:
    event = db.execute(
        select(EventOccurrence)
        .where(EventOccurrence.id == event_id)
        .options(selectinload(EventOccurrence.votes))
    ).scalar_one_or_none()
    if event is None:
        raise LookupError("event not found")
    return _event_to_dict(event)


def set_vote(db: Session, event_id: int, payload: EventVoteRequest) -> dict:
    event = db.get(EventOccurrence, event_id)
    if event is None:
        raise LookupError("event not found")
    if event.status in {EventStatus.CLOSED, EventStatus.CANCELLED}:
        raise ValueError("event is closed")

    vote = db.execute(
        select(EventVote).where(
            EventVote.event_id == event_id,
            EventVote.user_discord_id == payload.user_discord_id,
        )
    ).scalar_one_or_none()
    if vote is None:
        vote = EventVote(
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
        select(EventOccurrence)
        .where(EventOccurrence.id == event_id)
        .options(selectinload(EventOccurrence.votes))
    ).scalar_one()
    return _event_to_dict(event)


def remove_vote(db: Session, event_id: int, user_discord_id: str) -> dict:
    event = db.get(EventOccurrence, event_id)
    if event is None:
        raise LookupError("event not found")
    if event.status in {EventStatus.CLOSED, EventStatus.CANCELLED}:
        raise ValueError("event is closed")

    vote = db.execute(
        select(EventVote).where(
            EventVote.event_id == event_id,
            EventVote.user_discord_id == user_discord_id,
        )
    ).scalar_one_or_none()
    if vote is not None:
        db.delete(vote)
        event.updated_at = datetime.now(timezone.utc)
        db.commit()
        _touch_revision()

    event = db.execute(
        select(EventOccurrence)
        .where(EventOccurrence.id == event_id)
        .options(selectinload(EventOccurrence.votes))
    ).scalar_one()
    return _event_to_dict(event)


def close_event(db: Session, event_id: int) -> dict:
    event = db.get(EventOccurrence, event_id)
    if event is None:
        raise LookupError("event not found")
    event.status = EventStatus.CLOSED
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    _touch_revision()
    event = db.execute(
        select(EventOccurrence)
        .where(EventOccurrence.id == event_id)
        .options(selectinload(EventOccurrence.votes))
    ).scalar_one()
    return _event_to_dict(event)


def cancel_event(db: Session, event_id: int) -> dict:
    event = db.get(EventOccurrence, event_id)
    if event is None:
        raise LookupError("event not found")
    event.status = EventStatus.CANCELLED
    event.message_id = None
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    _touch_revision()
    event = db.execute(
        select(EventOccurrence)
        .where(EventOccurrence.id == event_id)
        .options(selectinload(EventOccurrence.votes))
    ).scalar_one()
    return _event_to_dict(event)


def cancel_event_by_message_id(db: Session, message_id: str) -> dict | None:
    event = db.execute(
        select(EventOccurrence)
        .where(EventOccurrence.message_id == message_id)
        .options(selectinload(EventOccurrence.votes))
    ).scalar_one_or_none()
    if event is None:
        return None

    event.status = EventStatus.CANCELLED
    event.message_id = None
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    _touch_revision()

    refreshed = db.execute(
        select(EventOccurrence)
        .where(EventOccurrence.id == event.id)
        .options(selectinload(EventOccurrence.votes))
    ).scalar_one()
    return _event_to_dict(refreshed)


def edit_event(db: Session, event_id: int, payload: EventEditRequest) -> dict:
    event = db.execute(
        select(EventOccurrence)
        .where(EventOccurrence.id == event_id)
        .options(selectinload(EventOccurrence.votes))
    ).scalar_one_or_none()
    if event is None:
        raise LookupError("event not found")
    if event.status in {EventStatus.CLOSED, EventStatus.CANCELLED}:
        raise ValueError("event is closed")

    series = db.get(EventSeries, int(event.series_id))
    if series is None:
        raise LookupError("series not found")

    if payload.expected_updated_at is not None and _revision_timestamp(event) != _as_utc(payload.expected_updated_at):
        raise ValueError("event changed by another admin, refresh and try again")

    new_start = _as_utc(payload.starts_at)
    if new_start <= datetime.now(timezone.utc):
        raise ValueError("cannot move kickoff to the past; choose a future date and time")
    publish_time = (payload.publish_time or "").strip() or None

    series.title = payload.title.strip()
    series.description = payload.description.strip()
    series.timezone = payload.timezone.strip() or "Europe/Bucharest"

    if payload.scope == "this_occurrence_only":
        event.closes_at = new_start
        effective_publish_time = publish_time or _publish_time_from_dt(event.starts_at, series.timezone)
        event.starts_at = _publish_at_for_kickoff(new_start, series.timezone, effective_publish_time)
        event.updated_at = datetime.now(timezone.utc)
    else:
        current_delta = new_start - event.closes_at
        following = db.execute(
            select(EventOccurrence)
            .where(
                EventOccurrence.series_id == event.series_id,
                EventOccurrence.occurrence_number >= event.occurrence_number,
                EventOccurrence.status.not_in([EventStatus.CLOSED, EventStatus.CANCELLED]),
            )
        ).scalars().all()
        for row in following:
            row.closes_at = row.closes_at + current_delta
            effective_publish_time = publish_time or _publish_time_from_dt(row.starts_at, series.timezone)
            row.starts_at = _publish_at_for_kickoff(row.closes_at, series.timezone, effective_publish_time)
            row.updated_at = datetime.now(timezone.utc)

    if payload.vote_updates:
        if _apply_vote_updates(event, payload.vote_updates):
            event.updated_at = datetime.now(timezone.utc)

    if event.updated_at is None:
        event.updated_at = datetime.now(timezone.utc)

    db.commit()
    _touch_revision()
    refreshed = db.execute(
        select(EventOccurrence)
        .where(EventOccurrence.id == event_id)
        .options(selectinload(EventOccurrence.votes))
    ).scalar_one()
    return _event_to_dict(refreshed)


def delete_event_permanently(db: Session, event_id: int) -> None:
    event = db.get(EventOccurrence, event_id)
    if event is None:
        raise LookupError("event not found")
    if event.status != EventStatus.CANCELLED:
        raise ValueError("only cancelled events can be permanently deleted")
    db.delete(event)
    db.commit()
    _touch_revision()


def reschedule_event(db: Session, event_id: int, payload: EventRescheduleRequest) -> dict:
    event = db.get(EventOccurrence, event_id)
    if event is None:
        raise LookupError("event not found")
    if event.status in {EventStatus.CLOSED, EventStatus.CANCELLED}:
        raise ValueError("event is closed")

    new_start = _as_utc(payload.starts_at)
    if new_start <= datetime.now(timezone.utc):
        raise ValueError("cannot move kickoff to the past; choose a future date and time")

    series = db.get(EventSeries, int(event.series_id))
    if series is None:
        raise LookupError("series not found")
    publish_time = (payload.publish_time or "").strip() or None

    if payload.scope == "this_occurrence_only":
        event.closes_at = new_start
        effective_publish_time = publish_time or _publish_time_from_dt(event.starts_at, series.timezone)
        event.starts_at = _publish_at_for_kickoff(new_start, series.timezone, effective_publish_time)
        db.commit()
        db.refresh(event)
        event = db.execute(
            select(EventOccurrence)
            .where(EventOccurrence.id == event.id)
            .options(selectinload(EventOccurrence.votes))
        ).scalar_one()
        return _event_to_dict(event)

    current_delta = new_start - event.closes_at
    following = db.execute(
        select(EventOccurrence)
        .where(
            EventOccurrence.series_id == event.series_id,
            EventOccurrence.occurrence_number >= event.occurrence_number,
            EventOccurrence.status.not_in([EventStatus.CLOSED, EventStatus.CANCELLED]),
        )
    ).scalars().all()

    for row in following:
        row.closes_at = row.closes_at + current_delta
        effective_publish_time = publish_time or _publish_time_from_dt(row.starts_at, series.timezone)
        row.starts_at = _publish_at_for_kickoff(row.closes_at, series.timezone, effective_publish_time)

    db.commit()
    db.refresh(event)
    event = db.execute(
        select(EventOccurrence)
        .where(EventOccurrence.id == event.id)
        .options(selectinload(EventOccurrence.votes))
    ).scalar_one()
    return _event_to_dict(event)


def close_due_events(db: Session) -> list[int]:
    now = datetime.now(timezone.utc)
    due = db.execute(
        select(EventOccurrence).where(
            EventOccurrence.status == EventStatus.OPEN,
            EventOccurrence.closes_at <= now,
            # If appearance is configured after kickoff, avoid instant auto-close.
            EventOccurrence.starts_at <= EventOccurrence.closes_at,
        )
    ).scalars().all()

    ids: list[int] = []
    for event in due:
        event.status = EventStatus.CLOSED
        ids.append(event.id)

    if ids:
        db.commit()

    return ids


def list_due_publication_events(db: Session, *, limit: int = 20) -> list[dict]:
    now = datetime.now(timezone.utc)
    due = db.execute(
        select(EventOccurrence)
        .where(
            EventOccurrence.status == EventStatus.SCHEDULED,
            EventOccurrence.message_id.is_(None),
            EventOccurrence.starts_at <= now,
        )
        .order_by(EventOccurrence.starts_at.asc())
        .limit(limit)
        .options(selectinload(EventOccurrence.series), selectinload(EventOccurrence.votes))
    ).scalars().all()

    rows: list[dict] = []
    for event in due:
        series = event.series
        if series is None:
            continue
        rows.append(
            {
                "series": {
                    "id": series.id,
                    "channel_id": series.channel_id,
                    "title": series.title,
                    "description": series.description,
                    "timezone": series.timezone,
                    "weekdays": _series_weekdays(series),
                    "post_timing_mode": series.post_timing_mode,
                    "post_timing_value": series.post_timing_value,
                    "mention_role_ids": json.loads(series.mention_role_ids or "[]"),
                    "created_by_discord_id": series.created_by_discord_id,
                },
                "event": _event_to_dict(event),
            }
        )
    return rows


def mark_event_open_with_message(db: Session, event_id: int, message_id: str) -> dict:
    event = db.get(EventOccurrence, event_id)
    if event is None:
        raise LookupError("event not found")
    event.message_id = message_id
    event.status = EventStatus.OPEN
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    _touch_revision()

    refreshed = db.execute(
        select(EventOccurrence)
        .where(EventOccurrence.id == event_id)
        .options(selectinload(EventOccurrence.votes))
    ).scalar_one()
    return _event_to_dict(refreshed)


def set_event_message_id(db: Session, event_id: int, message_id: str) -> None:
    event = db.get(EventOccurrence, event_id)
    if event is None:
        raise LookupError("event not found")
    event.message_id = message_id
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
