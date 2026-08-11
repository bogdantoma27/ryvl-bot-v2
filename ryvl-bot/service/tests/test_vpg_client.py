import asyncio

import httpx

from app.vpg.client import VpgClient


class FakeAsyncClient:
    def __init__(self):
        self.calls = 0

    async def get(self, path, params=None):
        self.calls += 1
        request = httpx.Request("GET", f"https://example.test{path}")
        return httpx.Response(200, json={"id": 1, "name": "Balkan VPG"}, request=request)


class PaginatedAsyncClient:
    def __init__(self):
        self.offsets = []

    async def get(self, path, params=None):
        self.offsets.append(params["offset"])
        offset = params["offset"]
        rows = [{"id": offset + 1, "home_name": "A", "away_name": "B"}]
        request = httpx.Request("GET", f"https://example.test{path}")
        return httpx.Response(200, json={"results": rows, "count": 2}, request=request)


def test_stable_vpg_metadata_is_cached():
    async def scenario():
        fake = FakeAsyncClient()
        client = VpgClient(fake)
        first = await client.get_community("VPG-Balkan")
        second = await client.get_community("VPG-Balkan")
        assert first == second
        assert fake.calls == 1

    asyncio.run(scenario())


def test_match_listing_paginates_results_until_count():
    async def scenario():
        fake = PaginatedAsyncClient()
        client = VpgClient(fake)
        matches = await client.list_matches("league", "complete", 4)
        assert [match.id for match in matches] == [1, 2]
        assert fake.offsets == [0, 1]

    asyncio.run(scenario())


def test_user_profile_is_cached():
    async def scenario():
        fake = FakeAsyncClient()
        client = VpgClient(fake)
        await client.get_user("player")
        await client.get_user("player")
        assert fake.calls == 1

    asyncio.run(scenario())