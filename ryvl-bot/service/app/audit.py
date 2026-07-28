import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLogEntry


def record_audit_log(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: str,
    actor_discord_id: str | None = None,
    details: dict | str | None = None,
) -> None:
    payload = details
    if isinstance(details, dict):
        payload = json.dumps(details, ensure_ascii=True, separators=(",", ":"))
    entry = AuditLogEntry(
        actor_discord_id=actor_discord_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=str(payload or ""),
        created_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    db.commit()


def list_recent_audit_logs(db: Session, limit: int = 20) -> list[dict]:
    rows = db.execute(
        select(AuditLogEntry).order_by(AuditLogEntry.created_at.desc()).limit(limit)
    ).scalars().all()
    return [
        {
            "id": row.id,
            "actor_discord_id": row.actor_discord_id,
            "action": row.action,
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "details": row.details,
            "created_at": row.created_at,
        }
        for row in rows
    ]
