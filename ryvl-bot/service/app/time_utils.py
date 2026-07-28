from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def _to_zone(dt: datetime, timezone_name: str) -> datetime:
    source = dt if dt.tzinfo is not None else dt.replace(tzinfo=ZoneInfo("UTC"))
    try:
        zone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        zone = ZoneInfo("UTC")
    return source.astimezone(zone)


def format_dual_kickoff_lines(
    dt: datetime,
    primary_timezone: str = "Europe/Bucharest",
    secondary_timezone: str = "Europe/London",
) -> list[str]:
    ro = _to_zone(dt, primary_timezone).strftime("%A, %d %b %Y %H:%M")
    uk = _to_zone(dt, secondary_timezone).strftime("%A, %d %b %Y %H:%M")
    return [f"🇷🇴 {ro}", f"🇬🇧 {uk}"]
