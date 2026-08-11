from datetime import datetime, timezone
from enum import StrEnum
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class RecurrenceType(StrEnum):
    NONE = "none"
    WEEKLY = "weekly"


class EventSeriesStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class RecurrenceEndsMode(StrEnum):
    NEVER = "never"
    AFTER_COUNT = "after_count"
    ON_DATE = "on_date"


class PostTimingMode(StrEnum):
    AT_EVENT_START = "at_event_start"
    BEFORE_EVENT_START = "before_event_start"
    WHEN_PREVIOUS_EVENT_ENDS = "when_previous_event_ends"
    AFTER_PREVIOUS_EVENT_ENDS = "after_previous_event_ends"
    AT_SPECIFIC_TIME = "at_specific_time"


class EventStatus(StrEnum):
    SCHEDULED = "scheduled"
    OPEN = "open"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class VoteStatus(StrEnum):
    ACCEPTED = "accepted"
    TENTATIVE = "tentative"
    DECLINED = "declined"


class VpgContentType(StrEnum):
    FIXTURES = "fixtures"
    RESULTS = "results"
    STANDINGS = "standings"


class EventSeries(Base):
    __tablename__ = "event_series"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    guild_id: Mapped[str] = mapped_column(String(64), index=True)
    channel_id: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Bucharest")
    recurrence: Mapped[RecurrenceType] = mapped_column(Enum(RecurrenceType), default=RecurrenceType.NONE)
    repeat_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    anchor_starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    weekdays: Mapped[str] = mapped_column(String(32), default="0")
    ends_mode: Mapped[str] = mapped_column(String(32), default=RecurrenceEndsMode.NEVER.value)
    end_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    post_timing_mode: Mapped[str] = mapped_column(String(40), default=PostTimingMode.AT_EVENT_START.value)
    post_timing_value: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default=EventSeriesStatus.ACTIVE.value, index=True)
    mention_role_ids: Mapped[str] = mapped_column(Text, default="[]")
    created_by_discord_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    events: Mapped[list["EventOccurrence"]] = relationship(back_populates="series", cascade="all, delete-orphan")


class EventOccurrence(Base):
    __tablename__ = "event_occurrences"
    __table_args__ = (
        UniqueConstraint("series_id", "occurrence_number", name="uq_series_occurrence"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    series_id: Mapped[int] = mapped_column(ForeignKey("event_series.id", ondelete="CASCADE"), index=True)
    occurrence_number: Mapped[int] = mapped_column(Integer)
    batch_number: Mapped[int] = mapped_column(Integer, default=1, index=True)
    weekday: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    closes_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[EventStatus] = mapped_column(Enum(EventStatus), default=EventStatus.SCHEDULED, index=True)
    message_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    series: Mapped[EventSeries] = relationship(back_populates="events")
    votes: Mapped[list["EventVote"]] = relationship(back_populates="event", cascade="all, delete-orphan")


class EventVote(Base):
    __tablename__ = "event_votes"
    __table_args__ = (
        UniqueConstraint("event_id", "user_discord_id", name="uq_event_user_vote"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("event_occurrences.id", ondelete="CASCADE"), index=True)
    user_discord_id: Mapped[str] = mapped_column(String(64), index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    status: Mapped[VoteStatus] = mapped_column(Enum(VoteStatus))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    event: Mapped[EventOccurrence] = relationship(back_populates="votes")


class RuntimeSetting(Base):
    __tablename__ = "runtime_settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AuditLogEntry(Base):
    __tablename__ = "audit_log_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_discord_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(120), index=True)
    entity_type: Mapped[str] = mapped_column(String(64), index=True)
    entity_id: Mapped[str] = mapped_column(String(64), index=True)
    details: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class LineupDraft(Base):
    __tablename__ = "lineup_drafts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    guild_id: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(120), default="RYVL Match Lineup")
    channel_id: Mapped[str] = mapped_column(String(64), default="")
    formation: Mapped[str] = mapped_column(String(32), default="4231")
    kickoff_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    mention_role_ids: Mapped[str] = mapped_column(Text, default="[]")
    assignments: Mapped[str] = mapped_column(Text, default="{}")
    created_by_discord_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class VpgSchedule(Base):
    __tablename__ = "vpg_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    guild_id: Mapped[str] = mapped_column(String(64), index=True)
    league_slug: Mapped[str] = mapped_column(String(160), index=True)
    league_name: Mapped[str] = mapped_column(String(160), default="")
    content_type: Mapped[VpgContentType] = mapped_column(Enum(VpgContentType))
    channel_id: Mapped[str] = mapped_column(String(64))
    weekdays: Mapped[str] = mapped_column(String(32), default="0")
    post_time: Mapped[str] = mapped_column(String(5), default="10:00")
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Bucharest")
    enabled: Mapped[bool] = mapped_column(default=True, index=True)
    last_run_key: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_discord_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class VpgTransferFeed(Base):
    __tablename__ = "vpg_transfer_feeds"
    __table_args__ = (UniqueConstraint("guild_id", name="uq_vpg_transfer_feed_guild"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    guild_id: Mapped[str] = mapped_column(String(64), index=True)
    community_slug: Mapped[str] = mapped_column(String(160), default="VPG-Balkan")
    channel_id: Mapped[str] = mapped_column(String(64), default="")
    poll_interval_minutes: Mapped[int] = mapped_column(Integer, default=20)
    enabled: Mapped[bool] = mapped_column(default=False, index=True)
    last_transfer_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_polled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    records: Mapped[list["VpgTransferRecord"]] = relationship(back_populates="feed", cascade="all, delete-orphan")


class VpgTransferRecord(Base):
    __tablename__ = "vpg_transfer_records"
    __table_args__ = (UniqueConstraint("feed_id", "vpg_movement_id", name="uq_vpg_transfer_movement"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    feed_id: Mapped[int] = mapped_column(ForeignKey("vpg_transfer_feeds.id", ondelete="CASCADE"), index=True)
    vpg_movement_id: Mapped[int] = mapped_column(Integer)
    username: Mapped[str] = mapped_column(String(120), default="")
    from_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    to_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    amount: Mapped[Optional[float]] = mapped_column(nullable=True)
    occurred_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    posted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    message_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    feed: Mapped[VpgTransferFeed] = relationship(back_populates="records")
