from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.event_service import generate_next_batch, update_draft_series
from app.db import Base
from app.models import (
    EventOccurrence,
    EventSeries,
    EventSeriesStatus,
    EventStatus,
    PostTimingMode,
    RecurrenceType,
)
from app.schemas import EventCreateRequest


@pytest.fixture()
def session():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    with session_factory() as db:
        yield db


def make_open_weekly_series(session, mode: str) -> EventSeries:
    kickoff = datetime.now(timezone.utc) + timedelta(days=1)
    series = EventSeries(
        guild_id="guild",
        channel_id="channel",
        title="Weekly event",
        description="",
        timezone="UTC",
        recurrence=RecurrenceType.WEEKLY,
        repeat_count=None,
        anchor_starts_at=kickoff,
        weekdays="0,2",
        ends_mode="never",
        post_timing_mode=mode,
        post_timing_value="60" if mode == PostTimingMode.BEFORE_EVENT_START.value else None,
        status=EventSeriesStatus.ACTIVE.value,
        mention_role_ids="[]",
        created_by_discord_id="admin",
    )
    session.add(series)
    session.flush()
    session.add_all([
        EventOccurrence(
            series_id=series.id,
            occurrence_number=1,
            batch_number=1,
            weekday=0,
            starts_at=kickoff,
            closes_at=kickoff + timedelta(hours=1),
            status=EventStatus.OPEN,
        ),
        EventOccurrence(
            series_id=series.id,
            occurrence_number=2,
            batch_number=1,
            weekday=2,
            starts_at=kickoff,
            closes_at=kickoff + timedelta(days=2, hours=1),
            status=EventStatus.OPEN,
        ),
    ])
    session.commit()
    return series


@pytest.mark.parametrize(
    ("mode", "creates_next_batch"),
    [
        (PostTimingMode.AT_EVENT_START.value, True),
        (PostTimingMode.BEFORE_EVENT_START.value, True),
        (PostTimingMode.WHEN_PREVIOUS_EVENT_ENDS.value, False),
        (PostTimingMode.AFTER_PREVIOUS_EVENT_ENDS.value, False),
        (PostTimingMode.AT_SPECIFIC_TIME.value, False),
    ],
)
def test_weekly_batch_timing_gate(session, mode, creates_next_batch):
    series = make_open_weekly_series(session, mode)

    created = generate_next_batch(session, series.id)

    assert bool(created) is creates_next_batch


def test_draft_update_preserves_anchor_and_schedule(session):
    kickoff = datetime.now(timezone.utc) + timedelta(days=3)
    series = EventSeries(
        guild_id="guild",
        channel_id="old-channel",
        title="Draft",
        description="",
        timezone="UTC",
        recurrence=RecurrenceType.WEEKLY,
        repeat_count=4,
        anchor_starts_at=kickoff,
        weekdays="0",
        ends_mode="never",
        post_timing_mode=PostTimingMode.AT_EVENT_START.value,
        status=EventSeriesStatus.DRAFT.value,
        mention_role_ids="[]",
        created_by_discord_id="admin",
    )
    session.add(series)
    session.commit()

    payload = EventCreateRequest(
        channel_id="new-channel",
        title="Updated draft",
        description="Updated details",
        timezone="UTC",
        starts_at=kickoff + timedelta(hours=1),
        recurrence=RecurrenceType.WEEKLY,
        repeat_count=6,
        weekdays=[1, 3],
        ends_mode="after_count",
        post_timing_mode=PostTimingMode.BEFORE_EVENT_START,
        post_timing_value="45",
        save_as_draft=True,
    )

    updated = update_draft_series(session, series.id, payload)

    assert updated["title"] == "Updated draft"
    assert updated["channel_id"] == "new-channel"
    assert updated["weekdays"] == [1, 3]
    assert updated["post_timing_value"] == "45"
    assert updated["anchor_starts_at"] == kickoff + timedelta(hours=1)
    assert updated["status"] == EventSeriesStatus.DRAFT.value
