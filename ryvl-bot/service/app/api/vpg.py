from __future__ import annotations

import asyncio

import discord
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import require_admin_session
from app.config import get_settings
from app.db import get_db
from app.discord_media import send_image_message
from app.audit import record_audit_log
from app.auth import SessionUser
from app.models import RuntimeSetting, VpgContentType, VpgSchedule, VpgTransferFeed, VpgTransferRecord
from app.vpg.service import _destination_league_logo_url, build_content, poll_transfer_feed
from app.vpg.client import VpgClient
from app.vpg.renderers import render_matches_png, render_standings_png

router = APIRouter(prefix="/api/admin/vpg", tags=["vpg"], dependencies=[Depends(require_admin_session)])
settings = get_settings()


class VpgCommunitySettings(BaseModel):
    community_slug: str = Field(min_length=2, max_length=160)
    community_slugs: list[str] = Field(default_factory=list, max_length=12)
    timezone: str = Field(min_length=2, max_length=64)


class VpgSchedulePayload(BaseModel):
    league_slug: str = Field(min_length=2, max_length=160)
    league_name: str = Field(default="", max_length=160)
    content_type: VpgContentType
    channel_id: str = Field(min_length=2, max_length=64)
    weekdays: list[int] = Field(min_length=1, max_length=7)
    post_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    timezone: str = Field(min_length=2, max_length=64)
    enabled: bool = True


class VpgTransferFeedPayload(BaseModel):
    community_slug: str = Field(min_length=2, max_length=160)
    channel_id: str = Field(min_length=2, max_length=64)
    poll_interval_minutes: int = Field(default=20, ge=1, le=1440)
    enabled: bool = False


class VpgPreviewPayload(BaseModel):
    league_slug: str = Field(min_length=2, max_length=160)
    content_type: VpgContentType
    season: int | None = None


class VpgPostPayload(VpgPreviewPayload):
    channel_id: str = Field(min_length=2, max_length=64)


def _schedule_view(row: VpgSchedule) -> dict:
    return {
        "id": row.id,
        "league_slug": row.league_slug,
        "league_name": row.league_name,
        "content_type": row.content_type.value,
        "channel_id": row.channel_id,
        "weekdays": [int(value) for value in row.weekdays.split(",") if value.strip().isdigit()],
        "post_time": row.post_time,
        "timezone": row.timezone,
        "enabled": row.enabled,
        "last_run_at": row.last_run_at,
        "last_error": row.last_error,
    }


@router.get("/schedules")
def list_schedules(db: Session = Depends(get_db)) -> list[dict]:
    return [_schedule_view(row) for row in db.query(VpgSchedule).order_by(VpgSchedule.id.desc()).all()]


@router.post("/schedules")
def create_schedule(payload: VpgSchedulePayload, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)) -> dict:
    row = VpgSchedule(
        guild_id=settings.discord_guild_id,
        league_slug=payload.league_slug.strip(),
        league_name=payload.league_name.strip(),
        content_type=payload.content_type,
        channel_id=payload.channel_id,
        weekdays=",".join(str(day) for day in sorted(set(payload.weekdays))),
        post_time=payload.post_time,
        timezone=payload.timezone,
        enabled=payload.enabled,
        created_by_discord_id=user.user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    record_audit_log(db, action="vpg.create_schedule", entity_type="vpg_schedule", entity_id=str(row.id), actor_discord_id=user.user_id)
    return _schedule_view(row)


@router.put("/schedules/{schedule_id}")
def update_schedule(schedule_id: int, payload: VpgSchedulePayload, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)) -> dict:
    row = db.get(VpgSchedule, schedule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="VPG schedule not found")
    for key, value in payload.model_dump().items():
        if key == "weekdays":
            value = ",".join(str(day) for day in sorted(set(value)))
        if key in {"league_slug", "league_name", "channel_id", "post_time", "timezone"}:
            value = value.strip()
        if hasattr(row, key):
            setattr(row, key, value)
    row.last_run_key = None
    db.commit()
    db.refresh(row)
    record_audit_log(db, action="vpg.update_schedule", entity_type="vpg_schedule", entity_id=str(row.id), actor_discord_id=user.user_id)
    return _schedule_view(row)


@router.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: int, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)) -> dict:
    row = db.get(VpgSchedule, schedule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="VPG schedule not found")
    db.delete(row)
    db.commit()
    record_audit_log(db, action="vpg.delete_schedule", entity_type="vpg_schedule", entity_id=str(schedule_id), actor_discord_id=user.user_id)
    return {"ok": True}


@router.patch("/schedules/{schedule_id}/enabled")
def set_schedule_enabled(schedule_id: int, enabled: bool, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)) -> dict:
    row = db.get(VpgSchedule, schedule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="VPG schedule not found")
    row.enabled = enabled
    db.commit()
    db.refresh(row)
    record_audit_log(db, action="vpg.set_schedule_enabled", entity_type="vpg_schedule", entity_id=str(schedule_id), actor_discord_id=user.user_id, details={"enabled": enabled})
    return _schedule_view(row)


@router.post("/schedules/{schedule_id}/run-now")
async def run_schedule_now(schedule_id: int, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)) -> dict[str, bool]:
    from app.vpg.service import run_due_schedules

    row = db.get(VpgSchedule, schedule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="VPG schedule not found")
    row.last_run_key = None
    db.commit()
    await run_due_schedules(schedule_id=schedule_id)
    record_audit_log(db, action="vpg.run_schedule_now", entity_type="vpg_schedule", entity_id=str(schedule_id), actor_discord_id=user.user_id)
    return {"ok": True}


def _feed_view(row: VpgTransferFeed) -> dict:
    return {
        "id": row.id,
        "community_slug": row.community_slug,
        "channel_id": row.channel_id,
        "poll_interval_minutes": row.poll_interval_minutes,
        "enabled": row.enabled,
        "last_polled_at": row.last_polled_at,
        "last_error": row.last_error,
    }


@router.get("/transfers/feed")
def get_transfer_feed(db: Session = Depends(get_db)) -> dict | None:
    row = db.query(VpgTransferFeed).filter(VpgTransferFeed.guild_id == settings.discord_guild_id).first()
    return _feed_view(row) if row else None


@router.put("/transfers/feed")
def update_transfer_feed(payload: VpgTransferFeedPayload, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)) -> dict:
    row = db.query(VpgTransferFeed).filter(VpgTransferFeed.guild_id == settings.discord_guild_id).first()
    if row is None:
        row = VpgTransferFeed(guild_id=settings.discord_guild_id)
        db.add(row)
    row.community_slug = payload.community_slug.strip()
    row.channel_id = payload.channel_id
    row.poll_interval_minutes = payload.poll_interval_minutes
    row.enabled = payload.enabled
    db.commit()
    db.refresh(row)
    record_audit_log(db, action="vpg.update_transfer_feed", entity_type="vpg_transfer_feed", entity_id=str(row.id), actor_discord_id=user.user_id, details={"community_slug": row.community_slug, "enabled": row.enabled})
    return _feed_view(row)


@router.get("/transfers/recent")
def recent_transfers(limit: int = 25, db: Session = Depends(get_db)) -> list[dict]:
    rows = db.query(VpgTransferRecord).order_by(VpgTransferRecord.occurred_at.desc(), VpgTransferRecord.id.desc()).limit(max(1, min(limit, 100))).all()
    return [{"id": row.id, "username": row.username, "from_name": row.from_name, "to_name": row.to_name, "amount": row.amount, "occurred_at": row.occurred_at, "message_id": row.message_id} for row in rows]


@router.post("/transfers/poll-now")
async def poll_transfers_now(user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)) -> dict[str, int]:
    row = db.query(VpgTransferFeed).filter(VpgTransferFeed.guild_id == settings.discord_guild_id).first()
    bot = getattr(poll_transfer_feed, "bot", None)
    if row is None:
        raise HTTPException(status_code=404, detail="Transfer feed is not configured")
    if bot is None:
        raise HTTPException(status_code=503, detail="Discord bot is not ready")
    posted = await poll_transfer_feed(row, bot)
    record_audit_log(db, action="vpg.poll_transfers_now", entity_type="vpg_transfer_feed", entity_id=str(row.id), actor_discord_id=user.user_id, details={"posted": posted})
    return {"posted": posted}


@router.post("/transfers/preview")
async def preview_transfer(community_slug: str | None = None, db: Session = Depends(get_db)) -> Response:
    from app.vpg.transfer_card import render_transfer_card_png

    from app.runtime_settings import get_runtime_settings
    runtime = get_runtime_settings(db, settings)
    feed = db.query(VpgTransferFeed).filter(VpgTransferFeed.guild_id == settings.discord_guild_id).first()
    community_slug = community_slug or (feed.community_slug if feed else None) or runtime["vpg_community_slug"]
    async with VpgClient() as client:
        movements = await client.list_movements(community_slug, limit=1)
        if not movements:
            raise HTTPException(status_code=404, detail="No VPG transfers available")
        movement = movements[0]
        community = await client.get_community(community_slug)
        try:
            user = await client.get_user(movement.username)
        except Exception:
            user = {}
        try:
            contracts = await client.get_user_contracts(movement.username)
        except Exception:
            contracts = []
        community_logo_url = client.cdn_url(community.get("logo_id") or community.get("logo"), "public")
        image = await asyncio.to_thread(
            render_transfer_card_png,
            username=movement.username,
            from_name=movement.from_name,
            to_name=movement.to_name or "Unknown team",
            avatar_url=client.cdn_url(user.get("user_avatar") or user.get("avatar") or user.get("avatar_id") or user.get("image_id"), "public"),
            from_logo_url=client.cdn_url(movement.from_logo),
            to_logo_url=client.cdn_url(movement.to_logo),
            league_logo_url=await _destination_league_logo_url(client, community_slug, movement, contracts) or community_logo_url,
            community_name=str(community.get("name") or community_slug),
        )
    return Response(content=image, media_type="image/png")


def _setting(db: Session, key: str, value: str) -> None:
    row = db.get(RuntimeSetting, key)
    if row is None:
        row = RuntimeSetting(key=key, value=value)
        db.add(row)
    else:
        row.value = value


@router.get("/settings")
def get_vpg_settings(db: Session = Depends(get_db)) -> dict:
    from app.runtime_settings import get_runtime_settings

    runtime = get_runtime_settings(db, settings)
    return {"community_slug": runtime["vpg_community_slug"], "community_slugs": runtime["vpg_community_slugs"], "timezone": runtime["vpg_timezone"]}


@router.put("/settings")
def update_vpg_settings(payload: VpgCommunitySettings, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)) -> dict:
    _setting(db, "vpg_community_slug", payload.community_slug.strip())
    slugs = [slug.strip() for slug in payload.community_slugs if slug.strip()]
    if payload.community_slug.strip() not in slugs:
        slugs.insert(0, payload.community_slug.strip())
    _setting(db, "vpg_community_slugs", ",".join(dict.fromkeys(slugs)))
    _setting(db, "vpg_timezone", payload.timezone.strip())
    db.commit()
    record_audit_log(db, action="vpg.update_settings", entity_type="vpg_settings", entity_id="vpg", actor_discord_id=user.user_id)
    return {"community_slug": payload.community_slug.strip(), "community_slugs": list(dict.fromkeys(slugs)), "timezone": payload.timezone.strip()}


@router.get("/communities")
async def list_communities(db: Session = Depends(get_db)) -> list[dict]:
    from app.runtime_settings import get_runtime_settings

    runtime = get_runtime_settings(db, settings)
    async with VpgClient() as client:
        communities = []
        for slug in runtime["vpg_community_slugs"]:
            community = await client.get_community(slug)
            communities.append({
                "slug": slug,
                "name": community.get("name") or slug,
                "logo_url": client.cdn_url(community.get("logo_id") or community.get("logo"), "public"),
            })
        return communities


@router.get("/leagues")
async def list_leagues(community: str | None = None, db: Session = Depends(get_db)) -> list[dict]:
    from app.runtime_settings import get_runtime_settings

    runtime = get_runtime_settings(db, settings)
    community_slugs = [community] if community else runtime["vpg_community_slugs"]
    async with VpgClient() as client:
        result = []
        for community_slug in community_slugs:
            rows = await client.list_community_leagues(community_slug)
            community_data = await client.get_community(community_slug)
            result.extend({
                "slug": row.get("slug"),
                "name": row.get("name") or row.get("slug"),
                "logo_url": client.cdn_url(row.get("logo") or row.get("logo_id"), "xlThumb"),
                "team_count": row.get("team_count"),
                "community_slug": community_slug,
                "community_name": community_data.get("name") or community_slug,
            } for row in rows if row.get("slug"))
        return result


@router.get("/leagues/{league_slug}/seasons")
async def list_seasons(league_slug: str) -> list[int]:
    async with VpgClient() as client:
        return await client.list_seasons(league_slug)


@router.get("/leagues/{league_slug}/standings")
async def standings(league_slug: str, season: int | None = None) -> list[dict]:
    async with VpgClient() as client:
        rows = await client.get_standings(league_slug, season)
        return [
            {
                "position": row.position,
                "team_name": row.team_name,
                "team_abbr": row.team_abbr,
                "team_logo_url": client.cdn_url(row.team_logo),
                "played": row.played,
                "wins": row.wins,
                "draws": row.draws,
                "losses": row.losses,
                "score_for": row.score_for,
                "score_against": row.score_against,
                "goal_difference": row.goal_difference,
                "points": row.points,
            }
            for row in rows
        ]


@router.get("/leagues/{league_slug}/matches")
async def matches(league_slug: str, status: str = "scheduled", season: int | None = None) -> list[dict]:
    if status not in {"scheduled", "complete"}:
        raise HTTPException(status_code=400, detail="status must be scheduled or complete")
    async with VpgClient() as client:
        rows = await client.list_matches(league_slug, status, season)
        return [
            {
                "id": row.id,
                "match_day": row.match_day,
                "home_name": row.home_name,
                "home_logo_url": client.cdn_url(row.home_logo),
                "home_id": row.home_id,
                "away_name": row.away_name,
                "away_logo_url": client.cdn_url(row.away_logo),
                "away_id": row.away_id,
                "home_score": row.home_score,
                "away_score": row.away_score,
                "datetime": row.datetime,
            }
            for row in rows
        ]


@router.post("/preview")
async def preview(payload: VpgPreviewPayload, db: Session = Depends(get_db)) -> Response:
    from app.runtime_settings import get_runtime_settings

    runtime = get_runtime_settings(db, settings)
    async with VpgClient() as client:
        image, _, _, _ = await build_content(client, payload.league_slug, payload.content_type, season=payload.season, timezone_name=runtime["vpg_timezone"])
    return Response(content=image, media_type="image/png")


@router.post("/post")
async def post_now(payload: VpgPostPayload, request: Request, db: Session = Depends(get_db)) -> dict[str, str]:
    from app.runtime_settings import get_runtime_settings

    runtime = get_runtime_settings(db, settings)
    bot = getattr(request.app.state, "discord_bot", None)
    if bot is None or not bot.is_ready():
        raise HTTPException(status_code=503, detail="Discord bot is not connected yet")
    channel = bot.get_channel(int(payload.channel_id))
    if channel is None:
        try:
            channel = await bot.fetch_channel(int(payload.channel_id))
        except Exception as error:
            raise HTTPException(status_code=404, detail="Channel not found") from error
    if not hasattr(channel, "send"):
        raise HTTPException(status_code=400, detail="Channel is not text-based")

    async with VpgClient() as client:
        image, league_name, _, _ = await build_content(client, payload.league_slug, payload.content_type, season=payload.season, timezone_name=runtime["vpg_timezone"])
    filename = f"vpg-{payload.content_type.value}-{payload.league_slug}.png"
    message = await send_image_message(
        channel,
        image,
        filename,
        embed=discord.Embed(title=f"{league_name} {payload.content_type.value}", color=0xDBA51D),
    )
    return {"ok": "true", "channel_id": payload.channel_id, "message_id": str(message.id)}