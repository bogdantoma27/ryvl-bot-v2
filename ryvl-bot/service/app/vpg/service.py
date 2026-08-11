from __future__ import annotations

import logging
import asyncio
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import discord
from sqlalchemy import select

from app.config import get_settings
from app.discord_media import send_image_message
from app.db import SessionLocal
from app.models import VpgContentType, VpgSchedule, VpgTransferFeed, VpgTransferRecord, utc_now
from app.vpg.client import VpgClient
from app.vpg.normalizers import VpgMovement
from app.vpg.timeframes import latest_completed_week, matches_in_week, monday_of_week
from app.vpg.transfer_card import render_transfer_card_png
from app.vpg.renderers import render_matches_png, render_standings_png

logger = logging.getLogger(__name__)
settings = get_settings()


def _transfer_cursor(last_id: int | None, existing_ids: set[int], movement_ids: list[int]) -> tuple[int | None, bool]:
    if last_id is None and not existing_ids:
        return (max(movement_ids) if movement_ids else None), True
    return last_id or 0, False


def _schedule_is_eligible(enabled: bool, schedule_id: int, requested_id: int | None) -> bool:
    return requested_id == schedule_id or enabled


def _schedule_due(schedule, now: datetime, requested_id: int | None = None) -> tuple[bool, str]:
    local = now.astimezone(ZoneInfo(schedule.timezone))
    run_key = local.strftime("%Y-%m-%d:%H:%M")
    if requested_id == schedule.id:
        return True, run_key
    selected_days = {int(value) for value in schedule.weekdays.split(",") if value.strip().isdigit()}
    return (
        _schedule_is_eligible(schedule.enabled, schedule.id, requested_id)
        and local.weekday() in selected_days
        and local.strftime("%H:%M") == schedule.post_time
        and schedule.last_run_key != run_key,
        run_key,
    )


def _count_season_transfers(contracts: list[dict], community_id: object, season_start: datetime) -> int:
    count = 0
    filtered = [contract for contract in contracts if community_id is None or contract.get("community_id") == community_id]
    dated_contracts = []
    for contract in filtered:
        raw_date = next(
            (contract.get(key) for key in ("started_at", "start_date", "created_at", "date") if contract.get(key)),
            None,
        )
        if not raw_date:
            continue
        parsed = _parse_datetime(raw_date)
        if parsed is not None:
            dated_contracts.append(parsed)
            if parsed >= season_start:
                count += 1
    return count if dated_contracts else len(filtered)


def _channel(bot, channel_id: str):
    return bot.get_channel(int(channel_id))


async def _destination_league_logo_url(client: VpgClient, community_slug: str, movement: VpgMovement, contracts: list[dict]) -> str | None:
    destination_names = {str(value).strip().casefold() for value in (movement.to_name, movement.to_slug) if value}
    league_id = None
    for contract in contracts:
        team_values = (contract.get("team_name"), contract.get("team_slug"), contract.get("team_id"), contract.get("current_team_name"), contract.get("current_team_id"))
        if destination_names.intersection(str(value).strip().casefold() for value in team_values if value):
            league_id = contract.get("league_id")
            if league_id is not None:
                break
    if league_id is None:
        return None
    for league in await client.list_community_leagues(community_slug):
        if str(league.get("id")) == str(league_id):
            return client.cdn_url(league.get("logo") or league.get("logo_id"), "xlThumb")
    return None


async def build_content(
    client: VpgClient,
    league_slug: str,
    content_type: VpgContentType,
    *,
    season: int | None = None,
    now: datetime | None = None,
    timezone_name: str = "Europe/Bucharest",
) -> tuple[bytes, str, int | None, str]:
    league = await client.get_league(league_slug)
    league_name = str(league.get("name") or league_slug)
    resolved_season = season if season is not None else await client.latest_season(league_slug)
    current_time = now or datetime.now(timezone.utc)
    if content_type == VpgContentType.STANDINGS:
        rows = await client.get_standings(league_slug, resolved_season)
        cdn_url = getattr(client, "cdn_url", None)
        logo_urls = {row.team_name: cdn_url(row.team_logo) for row in rows} if cdn_url else {}
        image = render_standings_png(league_name, resolved_season, rows, logo_urls)
    else:
        status = "scheduled" if content_type == VpgContentType.FIXTURES else "complete"
        matches = await client.list_matches(league_slug, status, resolved_season)
        matches = (
            matches_in_week(matches, monday_of_week(current_time, timezone_name), timezone_name)
            if content_type == VpgContentType.FIXTURES
            else latest_completed_week(matches, current_time, timezone_name)
        )
        cdn_url = getattr(client, "cdn_url", None)
        logo_urls = {}
        if cdn_url:
            for match in matches:
                logo_urls[match.home_name] = cdn_url(match.home_logo)
                logo_urls[match.away_name] = cdn_url(match.away_logo)
        image = render_matches_png(league_name, resolved_season, matches, content_type.value, logo_urls)
    filename = f"vpg-{content_type.value}-{league_slug}.png"
    return image, league_name, resolved_season, filename


def _movement_embed(movement: VpgMovement, community_name: str, transfer_count: int, avatar_url: str | None) -> discord.Embed:
    is_free = not movement.from_name
    embed = discord.Embed(
        title="✅ Free agent signing" if is_free else "✅ Transfer completed",
        color=0x1F8B4C,
        description=f"🕐 {movement.datetime or 'Unknown date'}",
    )
    embed.set_author(name=movement.username or "Unknown player")
    embed.add_field(name="🏟️ Team", value=f"🏆 {movement.to_name or 'Unknown team'}", inline=False)
    embed.add_field(name="📊 Player transfers this season", value=f"Count: {transfer_count}", inline=False)
    embed.add_field(name="From", value=movement.from_name or "Free agent", inline=True)
    embed.add_field(name="Fee", value="Free Transfer" if not movement.amount else f"€{movement.amount:,.0f}", inline=True)
    if movement.to_logo:
        embed.set_thumbnail(url=f"{settings.vpg_cdn_base_url}/{movement.to_logo}/xlThumb")
    if avatar_url:
        embed.set_author(name=movement.username or "Unknown player", icon_url=avatar_url)
    embed.set_footer(text="powered by @bgd7x")
    return embed


async def poll_transfer_feed(feed: VpgTransferFeed, bot) -> int:
    channel = _channel(bot, feed.channel_id)
    if channel is None or not hasattr(channel, "send"):
        raise RuntimeError(f"Transfer channel {feed.channel_id} is unavailable")

    async with VpgClient() as client:
        movements = await client.list_movements(feed.community_slug, limit=50)
        movements.sort(key=lambda item: (str(item.datetime or ""), item.id))
        with SessionLocal() as db:
            existing = set(
                db.execute(
                    select(VpgTransferRecord.vpg_movement_id).where(VpgTransferRecord.feed_id == feed.id)
                ).scalars().all()
            )
        cursor, baseline_only = _transfer_cursor(feed.last_transfer_id, existing, [item.id for item in movements])
        if baseline_only:
            with SessionLocal() as db:
                db.query(VpgTransferFeed).filter(VpgTransferFeed.id == feed.id).update({
                    "last_transfer_id": cursor,
                    "last_polled_at": utc_now(),
                    "last_error": None,
                })
                db.commit()
            return 0
        fresh = [item for item in movements if item.id > cursor and item.id not in existing]
        community = await client.get_community(feed.community_slug)
        community_name = str(community.get("name") or feed.community_slug)
        community_logo_url = client.cdn_url(community.get("logo_id"), "public")

        for movement in fresh:
            try:
                user = await client.get_user(movement.username)
            except Exception:
                logger.warning("Could not load VPG profile for %s", movement.username, exc_info=True)
                user = {}
            avatar_url = client.cdn_url(user.get("user_avatar") or user.get("avatar") or user.get("avatar_id") or user.get("image_id"), "public")
            community_id = community.get("id")
            try:
                contracts = await client.get_user_contracts(movement.username)
            except Exception:
                logger.warning("Could not load VPG contracts for %s", movement.username, exc_info=True)
                contracts = []
            season_start = datetime(datetime.now(timezone.utc).year, 1, 1, tzinfo=timezone.utc)
            transfer_count = _count_season_transfers(contracts, community_id, season_start)
            league_logo_url = await _destination_league_logo_url(client, feed.community_slug, movement, contracts) or community_logo_url
            banner = await asyncio.to_thread(
                render_transfer_card_png,
                username=movement.username,
                from_name=movement.from_name,
                to_name=movement.to_name or "Unknown team",
                avatar_url=avatar_url,
                from_logo_url=client.cdn_url(movement.from_logo),
                to_logo_url=client.cdn_url(movement.to_logo),
                league_logo_url=league_logo_url,
                community_name=community_name,
            )
            embed = _movement_embed(movement, community_name, transfer_count, avatar_url)
            embed.set_image(url=f"attachment://transfer-{movement.id}.png")
            message = await send_image_message(channel, banner, f"transfer-{movement.id}.png", embed=embed)
            with SessionLocal() as db:
                db.add(VpgTransferRecord(
                    feed_id=feed.id,
                    vpg_movement_id=movement.id,
                    username=movement.username,
                    from_name=movement.from_name,
                    to_name=movement.to_name,
                    amount=movement.amount,
                    occurred_at=_parse_datetime(movement.datetime),
                    posted_at=utc_now(),
                    message_id=str(message.id),
                ))
                db.query(VpgTransferFeed).filter(VpgTransferFeed.id == feed.id).update({
                    "last_transfer_id": max(feed.last_transfer_id or 0, movement.id),
                    "last_polled_at": utc_now(),
                    "last_error": None,
                })
                db.commit()
        newest_id = max((item.id for item in movements), default=feed.last_transfer_id or 0)
        with SessionLocal() as db:
            db.query(VpgTransferFeed).filter(VpgTransferFeed.id == feed.id).update({
                "last_transfer_id": max(feed.last_transfer_id or 0, newest_id),
                "last_polled_at": utc_now(),
                "last_error": None,
            })
            db.commit()
        return len(fresh)


def _parse_datetime(value) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed
    except ValueError:
        return None


async def run_due_schedules(now: datetime | None = None, schedule_id: int | None = None) -> list[int]:
    bot = getattr(run_due_schedules, "bot", None)
    if bot is None or not bot.is_ready():
        return []
    now = now or datetime.now(timezone.utc)
    with SessionLocal() as db:
        schedule_query = select(VpgSchedule)
        if schedule_id is None:
            schedule_query = schedule_query.where(VpgSchedule.enabled.is_(True))
        else:
            schedule_query = schedule_query.where(VpgSchedule.id == schedule_id)
        schedules = db.execute(schedule_query).scalars().all()
        due: list[VpgSchedule] = []
        for schedule in schedules:
            try:
                due_now, run_key = _schedule_due(schedule, now, schedule_id)
            except Exception:
                schedule.last_error = f"Invalid timezone: {schedule.timezone}"
                continue
            if not due_now:
                continue
            due.append(schedule)

        published: list[int] = []
        for schedule in due:
            channel = _channel(bot, schedule.channel_id)
            if channel is None or not hasattr(channel, "send"):
                schedule.last_error = f"Channel {schedule.channel_id} is unavailable"
                continue
            try:
                async with VpgClient() as client:
                    image, league_name, season, base_filename = await build_content(
                        client,
                        schedule.league_slug,
                        schedule.content_type,
                        now=now,
                        timezone_name=schedule.timezone,
                    )
                    title = f"{schedule.league_name or league_name} {schedule.content_type.value}"
                    embed = discord.Embed(title=title, color=0xDBA51D)
                    filename = f"vpg-{schedule.content_type.value}-{schedule.id}.png"
                embed.set_image(url=f"attachment://{filename}")
                await send_image_message(channel, image, filename, embed=embed)
                schedule.last_run_key = run_key if schedule_id != schedule.id else f"manual:{utc_now().isoformat()}"
                schedule.last_run_at = utc_now()
                schedule.last_error = None
                published.append(schedule.id)
            except Exception as exc:
                schedule.last_error = str(exc)[:1000]
                logger.exception("VPG schedule %s failed", schedule.id)
        db.commit()
        return published


async def poll_due_transfers(now: datetime | None = None) -> list[int]:
    bot = getattr(poll_due_transfers, "bot", None)
    if bot is None or not bot.is_ready():
        return []
    now = now or datetime.now(timezone.utc)
    with SessionLocal() as db:
        feeds = db.execute(select(VpgTransferFeed).where(VpgTransferFeed.enabled.is_(True))).scalars().all()
        due = [feed for feed in feeds if feed.last_polled_at is None or (now - feed.last_polled_at).total_seconds() >= feed.poll_interval_minutes * 60]
    posted: list[int] = []
    for feed in due:
        try:
            posted.append(await poll_transfer_feed(feed, bot))
        except Exception as exc:
            with SessionLocal() as db:
                db.query(VpgTransferFeed).filter(VpgTransferFeed.id == feed.id).update({"last_error": str(exc)[:1000], "last_polled_at": utc_now()})
                db.commit()
            logger.exception("VPG transfer feed %s failed", feed.id)
    return posted