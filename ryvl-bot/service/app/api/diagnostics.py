from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text

from app.auth import require_admin_session
from app.audit import list_recent_audit_logs
from app.config import get_settings
from app.db import SessionLocal
from app.scheduler import SCHEDULER_INTERVAL_SECONDS

router = APIRouter(prefix="/api/admin", tags=["diagnostics"], dependencies=[Depends(require_admin_session)])
settings = get_settings()


@router.get("/diagnostics")
async def diagnostics(request: Request) -> dict:
    now = datetime.now(timezone.utc)

    db_ok = True
    db_error = ""
    audit_logs = []
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
            audit_logs = list_recent_audit_logs(db, limit=10)
    except Exception as error:
        db_ok = False
        db_error = str(error)

    scheduler = getattr(request.app.state, "scheduler", None)
    scheduler_running = bool(getattr(scheduler, "is_running", False))
    scheduler_last_tick = getattr(scheduler, "last_tick_at", None)
    scheduler_last_error = getattr(scheduler, "last_error", None)

    bot = getattr(request.app.state, "discord_bot", None)
    bot_connected = bool(bot and bot.is_ready())

    guild_reachable = False
    guild_error = ""
    if bot_connected and settings.discord_guild_id:
        try:
            guild = bot.get_guild(int(settings.discord_guild_id))
            if guild is None:
                guild = await bot.fetch_guild(int(settings.discord_guild_id))
            guild_reachable = guild is not None
        except Exception as error:
            guild_reachable = False
            guild_error = str(error)

    started_at = getattr(request.app.state, "started_at", None)
    uptime_seconds = None
    if isinstance(started_at, datetime):
        uptime_seconds = int((now - started_at).total_seconds())

    return {
        "status": "ok" if db_ok and scheduler_running else "degraded",
        "checked_at": now.isoformat(),
        "uptime_seconds": uptime_seconds,
        "app": {
            "environment": settings.app_env,
            "public_api_base_url": settings.public_api_base_url,
            "guild_id_configured": bool(settings.discord_guild_id),
        },
        "database": {
            "ok": db_ok,
            "error": db_error,
        },
        "scheduler": {
            "running": scheduler_running,
            "interval_seconds": SCHEDULER_INTERVAL_SECONDS,
            "last_tick_at": scheduler_last_tick.isoformat() if isinstance(scheduler_last_tick, datetime) else None,
            "last_error": scheduler_last_error,
        },
        "discord": {
            "bot_connected": bot_connected,
            "guild_reachable": guild_reachable,
            "error": guild_error,
        },
        "audit_logs": audit_logs,
    }
