from fastapi import APIRouter, Depends
import re
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import require_admin_session
from app.config import get_settings
from app.db import get_db
from app.runtime_settings import get_runtime_settings, set_runtime_settings

router = APIRouter(prefix="/api/admin", tags=["settings"], dependencies=[Depends(require_admin_session)])
settings = get_settings()


class AdminSettingsUpdateRequest(BaseModel):
    default_timezone: str = Field(default="Europe/Bucharest")
    default_attendance_channel_id: str = Field(default="")
    default_lineup_channel_id: str = Field(default="")
    default_attendance_role_ids: list[str] = Field(default_factory=list)


def _admin_role_ids(raw: str) -> list[str]:
    values: list[str] = []
    for value in re.split(r"[,;\s]+", str(raw or "")):
        clean = value.strip()
        if clean:
            values.append(clean)
    return values


@router.get("/settings")
def get_admin_settings(db: Session = Depends(get_db)) -> dict:
    runtime = get_runtime_settings(db, settings)
    return {
        "guild_id": runtime["guild_id"],
        "default_timezone": runtime["default_timezone"],
        "default_attendance_channel_id": runtime["default_attendance_channel_id"],
        "default_lineup_channel_id": runtime["default_lineup_channel_id"],
        "admin_role_ids": runtime["admin_role_ids"] or _admin_role_ids(settings.admin_role_ids),
        "default_attendance_role_ids": runtime["default_attendance_role_ids"],
    }


@router.put("/settings")
def update_admin_settings(payload: AdminSettingsUpdateRequest, db: Session = Depends(get_db)) -> dict:
    set_runtime_settings(
        db,
        {
            "default_timezone": payload.default_timezone.strip() or "Europe/Bucharest",
            "default_attendance_channel_id": payload.default_attendance_channel_id.strip(),
            "default_lineup_channel_id": payload.default_lineup_channel_id.strip(),
            "default_attendance_role_ids": ",".join([role_id.strip() for role_id in payload.default_attendance_role_ids if role_id.strip()]),
        },
    )
    runtime = get_runtime_settings(db, settings)
    return {
        "guild_id": runtime["guild_id"],
        "default_timezone": runtime["default_timezone"],
        "default_attendance_channel_id": runtime["default_attendance_channel_id"],
        "default_lineup_channel_id": runtime["default_lineup_channel_id"],
        "admin_role_ids": runtime["admin_role_ids"] or _admin_role_ids(settings.admin_role_ids),
        "default_attendance_role_ids": runtime["default_attendance_role_ids"],
    }
