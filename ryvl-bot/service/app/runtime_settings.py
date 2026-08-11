from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import RuntimeSetting


def _load_map(db: Session) -> dict[str, str]:
    rows = db.execute(select(RuntimeSetting)).scalars().all()
    return {row.key: row.value for row in rows}


def get_runtime_settings(db: Session, base_settings: Settings) -> dict:
    stored = _load_map(db)
    default_timezone = str(stored.get("default_timezone") or base_settings.default_timezone or "Europe/Bucharest").strip() or "Europe/Bucharest"
    vpg_timezone = str(stored.get("vpg_timezone") or default_timezone).strip() or default_timezone
    vpg_community_slug = str(stored.get("vpg_community_slug") or "VPG-Balkan").strip() or "VPG-Balkan"
    raw_community_slugs = str(stored.get("vpg_community_slugs") or "VPG-Balkan,VPG-Europe,VPGRoPS5")
    community_slugs = [slug.strip() for slug in raw_community_slugs.split(",") if slug.strip()]
    if vpg_community_slug not in community_slugs:
        community_slugs.insert(0, vpg_community_slug)

    return {
        "guild_id": base_settings.discord_guild_id,
        "default_timezone": default_timezone,
        "vpg_timezone": vpg_timezone,
        "vpg_community_slug": vpg_community_slug,
        "vpg_community_slugs": community_slugs,
    }
