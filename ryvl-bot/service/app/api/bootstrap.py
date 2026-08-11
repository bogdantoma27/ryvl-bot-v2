from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import require_admin_session
from app.config import get_settings
from app.db import get_db
from app.runtime_settings import get_runtime_settings

router = APIRouter(prefix="/api/admin", tags=["bootstrap"], dependencies=[Depends(require_admin_session)])
public_router = APIRouter(prefix="/api/public", tags=["bootstrap"])
settings = get_settings()


@public_router.get("/guild")
async def public_guild_info(request: Request) -> dict:
    guild_name: str | None = None
    guild_icon_url: str | None = None

    bot = getattr(request.app.state, "discord_bot", None)
    if bot is not None and bot.is_ready() and settings.discord_guild_id:
        guild = bot.get_guild(int(settings.discord_guild_id))
        if guild is None:
            guild = await bot.fetch_guild(int(settings.discord_guild_id))
        guild_name = guild.name
        guild_icon_url = str(guild.icon.url) if guild.icon else None

    return {"guild_name": guild_name, "guild_icon_url": guild_icon_url}


@router.get("/bootstrap")
async def bootstrap(request: Request, db: Session = Depends(get_db)) -> dict:
    if not settings.discord_guild_id:
        raise HTTPException(status_code=500, detail="DISCORD_GUILD_ID is not configured")

    bot = getattr(request.app.state, "discord_bot", None)
    channels: list[dict[str, str]] = []
    members: list[dict[str, str | None]] = []
    roles: list[dict[str, str]] = []
    guild_name: str | None = None
    guild_icon_url: str | None = None

    if bot is not None and bot.is_ready():
        guild = bot.get_guild(int(settings.discord_guild_id))
        if guild is None:
            guild = await bot.fetch_guild(int(settings.discord_guild_id))

        guild_name = guild.name
        guild_icon_url = str(guild.icon.url) if guild.icon else None

        fetched_channels = await guild.fetch_channels()
        channels = [
            {"id": str(channel.id), "name": channel.name}
            for channel in fetched_channels
            if getattr(channel, "type", None) and str(channel.type) in {"text", "news"}
        ]

        if guild.chunked:
            guild_members = list(guild.members)
        else:
            guild_members = [member async for member in guild.fetch_members(limit=None)]

        members = [
            {
                "id": str(member.id),
                "display_name": member.display_name,
                "username": member.name,
                "avatar_url": str(member.display_avatar.url) if member.display_avatar else None,
            }
            for member in guild_members
            if not member.bot
        ]

        roles = [
            {"id": str(role.id), "name": role.name}
            for role in guild.roles
            if not role.is_default() and not role.managed
        ]

    channels.sort(key=lambda item: item["name"].lower())
    members.sort(key=lambda item: str(item.get("display_name") or "").lower())
    roles.sort(key=lambda item: item["name"].lower())

    runtime = get_runtime_settings(db, settings)
    return {
        "guild_id": settings.discord_guild_id,
        "guild_name": guild_name,
        "guild_icon_url": guild_icon_url,
        "default_timezone": runtime["default_timezone"],
        "channels": channels,
        "members": members,
        "roles": roles,
    }
