from __future__ import annotations

from collections.abc import Iterable
import time
from typing import Any

import httpx

from app.config import get_settings
from app.vpg.normalizers import VpgMatch, VpgMovement, VpgStandingRow, normalise_match, normalise_movement, normalise_standings


class VpgClient:
    def __init__(self, client: httpx.AsyncClient | None = None):
        settings = get_settings()
        self._client = client
        self._owns_client = client is None
        self.base_url = settings.vpg_api_base_url.rstrip("/")
        self.cdn_base_url = settings.vpg_cdn_base_url.rstrip("/")
        self.headers = {"User-Agent": settings.vpg_user_agent}
        self._cache: dict[str, tuple[float, Any]] = {}
        self._cache_ttl_seconds = 60.0

    async def __aenter__(self) -> "VpgClient":
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=self.base_url, headers=self.headers, timeout=20)
        return self

    async def __aexit__(self, *_: object) -> None:
        if self._client is not None and self._owns_client:
            await self._client.aclose()

    async def _get(self, path: str, **params: Any) -> Any:
        if self._client is None:
            async with self:
                return await self._get(path, **params)
        response = await self._client.get(path, params={key: value for key, value in params.items() if value is not None})
        response.raise_for_status()
        return response.json()

    async def _get_cached(self, key: str, path: str, **params: Any) -> Any:
        cached = self._cache.get(key)
        if cached and cached[0] > time.monotonic():
            return cached[1]
        payload = await self._get(path, **params)
        self._cache[key] = (time.monotonic() + self._cache_ttl_seconds, payload)
        return payload

    @staticmethod
    def _items(payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if isinstance(payload, dict):
            for key in ("data", "results", "items"):
                value = payload.get(key)
                if isinstance(value, list):
                    return [item for item in value if isinstance(item, dict)]
        return []

    async def list_community_leagues(self, community_slug: str) -> list[dict[str, Any]]:
        payload = await self._get_cached(f"community-leagues:{community_slug}", f"/communities/{community_slug}/leagues/", limit=100, offset=0)
        return self._items(payload)

    async def get_community(self, community_slug: str) -> dict[str, Any]:
        payload = await self._get_cached(f"community:{community_slug}", f"/communities/{community_slug}/")
        return payload if isinstance(payload, dict) else {}

    async def get_league(self, league_slug: str) -> dict[str, Any]:
        payload = await self._get_cached(f"league:{league_slug}", f"/leagues/{league_slug}/")
        return payload if isinstance(payload, dict) else {}

    async def get_league_community(self, league_slug: str) -> dict[str, Any]:
        payload = await self._get_cached(f"league-community:{league_slug}", f"/leagues/{league_slug}/community/")
        return payload if isinstance(payload, dict) else {}

    async def list_seasons(self, league_slug: str) -> list[int]:
        payload = await self._get_cached(f"seasons:{league_slug}", f"/leagues/{league_slug}/seasons/")
        values = payload if isinstance(payload, list) else self._items(payload)
        seasons: list[int] = []
        for value in values:
            raw = value if isinstance(value, (int, str)) else value.get("season") or value.get("id")
            try:
                seasons.append(int(raw))
            except (TypeError, ValueError):
                continue
        return sorted(set(seasons))

    async def latest_season(self, league_slug: str) -> int | None:
        seasons = await self.list_seasons(league_slug)
        return max(seasons) if seasons else None

    async def get_standings(self, league_slug: str, season: int | None = None) -> list[VpgStandingRow]:
        payload = await self._get(f"/leagues/{league_slug}/table/", season=season, is_history=False)
        return [normalise_standings(item, index) for index, item in enumerate(self._items(payload))]

    async def list_matches(self, league_slug: str, status: str, season: int | None = None) -> list[VpgMatch]:
        offset = 0
        matches: list[VpgMatch] = []
        while True:
            payload = await self._get(
                f"/leagues/{league_slug}/matches/",
                status=status,
                season=season,
                limit=100,
                offset=offset,
            )
            page = self._items(payload)
            matches.extend(normalise_match(item, offset + index) for index, item in enumerate(page))
            count = payload.get("count") if isinstance(payload, dict) else None
            if not page or (count is not None and offset + len(page) >= int(count)) or (count is None and len(page) < 100):
                break
            offset += len(page)
        return matches

    async def list_movements(self, community_slug: str, limit: int = 20, offset: int = 0) -> list[VpgMovement]:
        payload = await self._get(f"/communities/{community_slug}/movement/", limit=limit, offset=offset)
        return [normalise_movement(item) for item in self._items(payload)]

    async def get_user_contracts(self, username: str) -> list[dict[str, Any]]:
        payload = await self._get_cached(f"contracts:{username}", f"/users/{username}/contracts/")
        return self._items(payload)

    async def get_user(self, username: str) -> dict[str, Any]:
        payload = await self._get_cached(f"user:{username}", f"/users/{username}/")
        return payload if isinstance(payload, dict) else {}

    def cdn_url(self, image_id: str | int | None, variant: str = "xlThumb") -> str | None:
        if image_id is None or str(image_id).strip() == "":
            return None
        return f"{self.cdn_base_url}/{image_id}/{variant}"