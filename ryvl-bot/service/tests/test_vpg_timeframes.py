from datetime import datetime, timezone

from app.vpg.normalizers import normalise_match
from app.vpg.timeframes import latest_completed_week, matches_in_week, monday_of_week, to_calendar_week


def test_monday_of_week_uses_target_timezone():
    value = datetime(2026, 8, 16, 22, 30, tzinfo=timezone.utc)
    assert monday_of_week(value, "Europe/Bucharest").isoformat() == "2026-08-17"


def test_to_calendar_week_converts_sessions():
    assert to_calendar_week(3) == 2


def test_matches_are_selected_by_local_monday_to_sunday_week():
    matches = [
        normalise_match({"id": 1, "datetime": "2026-08-10T18:00:00Z"}),
        normalise_match({"id": 2, "datetime": "2026-08-17T18:00:00Z"}),
    ]
    assert [match.id for match in matches_in_week(matches, monday_of_week(datetime(2026, 8, 11, tzinfo=timezone.utc)))] == [1]


def test_latest_completed_week_ignores_future_week():
    matches = [
        normalise_match({"id": 1, "datetime": "2026-08-03T18:00:00Z"}),
        normalise_match({"id": 2, "datetime": "2026-08-10T18:00:00Z"}),
    ]
    selected = latest_completed_week(matches, datetime(2026, 8, 11, tzinfo=timezone.utc))
    assert [match.id for match in selected] == [2]