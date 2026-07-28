from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models import EventStatus, RecurrenceType, VoteStatus


class AttendanceCreateRequest(BaseModel):
    channel_id: str = Field(min_length=2, max_length=64)
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    timezone: str = Field(default="Europe/Bucharest")
    mention_role_ids: list[str] = Field(default_factory=list)
    starts_at: datetime
    recurrence: RecurrenceType = RecurrenceType.NONE
    repeat_count: int | None = Field(default=None, ge=1, le=52)


class AttendanceVoteRequest(BaseModel):
    user_discord_id: str = Field(min_length=2, max_length=64)
    display_name: str = Field(min_length=1, max_length=120)
    status: VoteStatus


class AttendanceRescheduleRequest(BaseModel):
    starts_at: datetime
    scope: Literal["this_occurrence_only", "this_and_following"] = "this_occurrence_only"


class AttendanceEditRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    timezone: str = Field(default="Europe/Bucharest")
    starts_at: datetime
    scope: Literal["this_occurrence_only", "this_and_following"] = "this_occurrence_only"
    expected_updated_at: datetime | None = None
    vote_updates: list[AttendanceVoteRequest] = Field(default_factory=list)


class AttendanceVoteView(BaseModel):
    user_discord_id: str
    display_name: str
    status: VoteStatus
    updated_at: datetime


class AttendanceEventView(BaseModel):
    id: int
    series_id: int
    occurrence_number: int
    starts_at: datetime
    closes_at: datetime
    status: EventStatus
    message_id: str | None
    votes: list[AttendanceVoteView]


class AttendanceSeriesView(BaseModel):
    id: int
    guild_id: str
    channel_id: str
    title: str
    description: str
    timezone: str
    recurrence: RecurrenceType
    repeat_count: int | None
    created_by_discord_id: str
    events: list[AttendanceEventView]
