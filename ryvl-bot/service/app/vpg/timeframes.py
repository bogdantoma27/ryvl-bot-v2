from datetime import date, datetime, timedelta
from math import ceil
from zoneinfo import ZoneInfo


def _local(value: datetime, timezone: str) -> datetime:
    local = value if value.tzinfo else value.replace(tzinfo=ZoneInfo("UTC"))
    return local.astimezone(ZoneInfo(timezone))


def day_key(value: datetime, timezone: str = "Europe/Bucharest") -> str:
    return _local(value, timezone).date().isoformat()


def monday_of_week(value: datetime, timezone: str = "Europe/Bucharest") -> date:
    local_date = _local(value, timezone).date()
    return local_date - timedelta(days=local_date.weekday())


def to_calendar_week(session_week: int | None, sessions_per_week: int = 2) -> int | None:
    if session_week is None:
        return None
    return max(1, ceil(int(session_week) / sessions_per_week))


def _match_datetime(match) -> datetime | None:
    value = getattr(match, "datetime", None)
    if isinstance(value, datetime):
        return value
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.replace(tzinfo=ZoneInfo("UTC")) if parsed.tzinfo is None else parsed
    except ValueError:
        return None


def matches_in_week(matches: list, anchor_monday: date, timezone: str = "Europe/Bucharest") -> list:
    return [
        match
        for match in matches
        if (match_datetime := _match_datetime(match)) is not None
        and monday_of_week(match_datetime, timezone) == anchor_monday
    ]


def latest_completed_week(matches: list, now: datetime, timezone: str = "Europe/Bucharest") -> list:
    current_monday = monday_of_week(now, timezone)
    grouped: dict[date, list] = {}
    for match in matches:
        match_datetime = _match_datetime(match)
        if match_datetime is None:
            continue
        monday = monday_of_week(match_datetime, timezone)
        if monday <= current_monday:
            grouped.setdefault(monday, []).append(match)
    return grouped[max(grouped)] if grouped else []