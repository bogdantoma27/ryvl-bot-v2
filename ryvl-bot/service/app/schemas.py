from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models import EventSeriesStatus, EventStatus, PostTimingMode, RecurrenceEndsMode, RecurrenceType, VoteStatus


class EventCreateRequest(BaseModel):
    channel_id: str = Field(min_length=2, max_length=64)
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    timezone: str = Field(default="Europe/Bucharest")
    mention_role_ids: list[str] = Field(default_factory=list)
    starts_at: datetime
    publish_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    recurrence: RecurrenceType = RecurrenceType.NONE
    repeat_count: int | None = Field(default=None, ge=1, le=52)
    weekdays: list[int] = Field(default_factory=list, max_length=7)
    ends_mode: RecurrenceEndsMode = RecurrenceEndsMode.NEVER
    end_date: datetime | None = None
    post_timing_mode: PostTimingMode = PostTimingMode.AT_EVENT_START
    post_timing_value: str | None = None
    save_as_draft: bool = False


class EventVoteRequest(BaseModel):
    user_discord_id: str = Field(min_length=2, max_length=64)
    display_name: str = Field(min_length=1, max_length=120)
    status: VoteStatus


class EventRescheduleRequest(BaseModel):
    starts_at: datetime
    publish_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    scope: Literal["this_occurrence_only", "this_and_following"] = "this_occurrence_only"


class EventEditRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    timezone: str = Field(default="Europe/Bucharest")
    starts_at: datetime
    publish_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    scope: Literal["this_occurrence_only", "this_and_following"] = "this_occurrence_only"
    expected_updated_at: datetime | None = None
    vote_updates: list[EventVoteRequest] = Field(default_factory=list)


class EventVoteView(BaseModel):
    user_discord_id: str
    display_name: str
    status: VoteStatus
    updated_at: datetime


class EventOccurrenceView(BaseModel):
    id: int
    series_id: int
    occurrence_number: int
    batch_number: int
    weekday: int | None
    publish_at: datetime
    starts_at: datetime
    closes_at: datetime
    status: EventStatus
    message_id: str | None
    votes: list[EventVoteView]


class EventSeriesView(BaseModel):
    id: int
    guild_id: str
    channel_id: str
    title: str
    description: str
    timezone: str
    recurrence: RecurrenceType
    repeat_count: int | None
    anchor_starts_at: datetime | None
    weekdays: list[int]
    ends_mode: RecurrenceEndsMode
    end_date: datetime | None
    post_timing_mode: PostTimingMode
    post_timing_value: str | None
    status: EventSeriesStatus
    created_by_discord_id: str
    events: list[EventOccurrenceView]
