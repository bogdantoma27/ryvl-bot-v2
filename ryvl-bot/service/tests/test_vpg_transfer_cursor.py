from datetime import datetime, timezone

from types import SimpleNamespace

from app.vpg.service import _parse_datetime, _schedule_due, _schedule_is_eligible, _transfer_cursor


def test_transfer_datetime_parser_handles_utc_suffix():
    value = _parse_datetime("2026-08-11T20:31:00Z")
    assert value == datetime(2026, 8, 11, 20, 31, tzinfo=timezone.utc)


def test_first_transfer_poll_baselines_without_posting_history():
    assert _transfer_cursor(None, set(), [4, 9, 7]) == (9, True)
    assert _transfer_cursor(4, set(), [9]) == (4, False)


def test_manual_schedule_execution_can_target_paused_schedule():
    assert _schedule_is_eligible(False, 7, 7)
    assert not _schedule_is_eligible(False, 7, None)
    assert _schedule_is_eligible(True, 7, None)


def test_schedule_due_is_idempotent_by_local_run_key():
    schedule = SimpleNamespace(id=7, enabled=True, timezone="Europe/Bucharest", weekdays="1", post_time="10:00", last_run_key=None)
    now = datetime(2026, 8, 11, 7, 0, tzinfo=timezone.utc)
    due, key = _schedule_due(schedule, now)
    assert due is True
    schedule.last_run_key = key
    due_again, _ = _schedule_due(schedule, now)
    assert due_again is False