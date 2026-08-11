import asyncio
from datetime import datetime, timezone

from app.models import VpgContentType
from app.vpg.normalizers import normalise_match, normalise_standings
from app.vpg.service import build_content


class FakeVpgClient:
    def __init__(self):
        self.seasons_calls = 0
        self.match_calls = 0

    async def get_league(self, slug):
        return {"name": "Test League"}

    async def latest_season(self, slug):
        self.seasons_calls += 1
        return 8

    async def get_standings(self, slug, season):
        return [normalise_standings({"position": 1, "team_name": "A", "points": 3})]

    async def list_matches(self, slug, status, season):
        self.match_calls += 1
        return [
            normalise_match({"id": 1, "datetime": "2026-08-10T18:00:00Z", "home_name": "A", "away_name": "B"}),
            normalise_match({"id": 2, "datetime": "2026-08-17T18:00:00Z", "home_name": "C", "away_name": "D"}),
        ]


def test_build_content_resolves_season_and_renders_standings():
    async def scenario():
        client = FakeVpgClient()
        image, name, season, filename = await build_content(client, "test", VpgContentType.STANDINGS)
        assert image.startswith(b"\x89PNG")
        assert (name, season, filename) == ("Test League", 8, "vpg-standings-test.png")
        assert client.seasons_calls == 1

    asyncio.run(scenario())


def test_build_content_filters_fixture_week():
    async def scenario():
        client = FakeVpgClient()
        image, _, _, _ = await build_content(
            client,
            "test",
            VpgContentType.FIXTURES,
            season=8,
            now=datetime(2026, 8, 11, 12, tzinfo=timezone.utc),
        )
        assert image.startswith(b"\x89PNG")
        assert client.match_calls == 1

    asyncio.run(scenario())