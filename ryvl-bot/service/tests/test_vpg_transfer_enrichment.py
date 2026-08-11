from datetime import datetime, timezone

from app.vpg.service import _count_season_transfers, _transfer_cursor


def test_transfer_cursor_still_supports_posting_after_baseline():
    cursor, baseline = _transfer_cursor(12, {12}, [13, 14])
    assert cursor == 12
    assert baseline is False


def test_transfer_count_filters_community_and_season():
    contracts = [
        {"community_id": 3, "started_at": "2026-02-01T00:00:00Z"},
        {"community_id": 3, "started_at": "2025-12-01T00:00:00Z"},
        {"community_id": 4, "started_at": "2026-03-01T00:00:00Z"},
    ]
    assert _count_season_transfers(contracts, 3, datetime(2026, 1, 1, tzinfo=timezone.utc)) == 1


def test_transfer_count_falls_back_to_community_contracts_without_dates():
    contracts = [{"community_id": 3, "team_name": "A"}, {"community_id": 3, "team_name": "B"}, {"community_id": 4, "team_name": "C"}]
    assert _count_season_transfers(contracts, 3, datetime(2026, 1, 1, tzinfo=timezone.utc)) == 2