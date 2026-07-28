from datetime import datetime, timezone
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import RuntimeSetting


def _parse_id_list(raw: str) -> list[str]:
    values: list[str] = []
    for value in re.split(r"[,;\s]+", str(raw or "")):
        clean = value.strip()
        if clean and clean not in values:
            values.append(clean)
    return values


def _load_map(db: Session) -> dict[str, str]:
    rows = db.execute(select(RuntimeSetting)).scalars().all()
    return {row.key: row.value for row in rows}


def get_runtime_settings(db: Session, base_settings: Settings) -> dict:
    stored = _load_map(db)

    default_attendance_channel_id = str(
        stored.get("default_attendance_channel_id") or base_settings.default_attendance_channel_id or ""
    ).strip()
    default_lineup_channel_id = str(
        stored.get("default_lineup_channel_id") or base_settings.default_lineup_channel_id or ""
    ).strip()

    admin_role_ids = _parse_id_list(str(stored.get("admin_role_ids") or base_settings.admin_role_ids or ""))
    default_attendance_role_ids = _parse_id_list(str(stored.get("default_attendance_role_ids") or ""))
    default_timezone = str(stored.get("default_timezone") or base_settings.default_timezone or "Europe/Bucharest").strip() or "Europe/Bucharest"

    return {
        "guild_id": base_settings.discord_guild_id,
        "default_timezone": default_timezone,
        "default_attendance_channel_id": default_attendance_channel_id,
        "default_lineup_channel_id": default_lineup_channel_id,
        "admin_role_ids": admin_role_ids,
        "default_attendance_role_ids": default_attendance_role_ids,
    }


def set_runtime_settings(db: Session, values: dict[str, str]) -> None:
    for key, value in values.items():
        row = db.get(RuntimeSetting, key)
        if row is None:
            row = RuntimeSetting(key=key, value=value, updated_at=datetime.now(timezone.utc))
            db.add(row)
        else:
            row.value = value
            row.updated_at = datetime.now(timezone.utc)
    db.commit()
