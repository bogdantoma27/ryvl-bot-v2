from datetime import datetime
import json

import discord
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.audit import record_audit_log
from app.auth import SessionUser, require_admin_session
from app.config import get_settings
from app.discord_media import send_image_message
from app.db import get_db
from app.lineup_formations import FORMATIONS, formation_keys
from app.lineup_formations import slots_by_formation as formation_slot_map
from app.lineup_renderer import RENDER_HEIGHT, RENDER_WIDTH, render_lineup_png
from app.models import LineupDraft
from app.time_utils import format_dual_kickoff_lines

router = APIRouter(prefix="/api/admin/lineup", tags=["lineup"], dependencies=[Depends(require_admin_session)])
settings = get_settings()


class LineupPostRequest(BaseModel):
    channel_id: str = Field(min_length=2, max_length=64)
    title: str = Field(min_length=1, max_length=120)
    formation: str = Field(min_length=2, max_length=32)
    players: dict[str, str] = Field(default_factory=dict)
    kickoff_at: datetime | None = None
    primary_color: str | None = None
    secondary_color: str | None = None

    @field_validator("players")
    @classmethod
    def validate_players(cls, value: dict[str, str]) -> dict[str, str]:
        clean: dict[str, str] = {}
        for key, player in (value or {}).items():
            slot = str(key).strip().lower()
            name = str(player).strip()
            if slot and name:
                clean[slot] = name[:28]
        return clean


class LineupRenderRequest(BaseModel):
    formation: str = Field(min_length=2, max_length=32)
    title: str = Field(min_length=1, max_length=120)
    players: dict[str, str] = Field(default_factory=dict)
    kickoff_at: datetime | None = None
    primary_color: str | None = None
    secondary_color: str | None = None


class LineupPostResponse(BaseModel):
    ok: bool
    channel_id: str
    message_id: str


class LineupSendRequest(LineupPostRequest):
    mention_role_ids: list[str] = Field(default_factory=list)


class LineupDraftPayload(BaseModel):
    title: str = Field(default="RYVL Match Lineup", max_length=120)
    channel_id: str = Field(default="", max_length=64)
    formation: str = Field(default="4231", max_length=32)
    kickoff_at: datetime | None = None
    mention_role_ids: list[str] = Field(default_factory=list)
    assignments: dict[str, str] = Field(default_factory=dict)


class LineupDraftView(BaseModel):
    id: int
    title: str
    channel_id: str
    formation: str
    kickoff_at: datetime | None
    mention_role_ids: list[str]
    assignments: dict[str, str]
    created_at: datetime
    updated_at: datetime


def _draft_to_view(draft: LineupDraft) -> LineupDraftView:
    return LineupDraftView(
        id=draft.id,
        title=draft.title,
        channel_id=draft.channel_id,
        formation=draft.formation,
        kickoff_at=draft.kickoff_at,
        mention_role_ids=json.loads(draft.mention_role_ids or "[]"),
        assignments=json.loads(draft.assignments or "{}"),
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )


class LineupFormationsResponse(BaseModel):
    formations: list[str]
    labels_by_formation: dict[str, str]
    slots_by_formation: dict[str, list[str]]
    coords_by_formation: dict[str, dict[str, tuple[int, int]]]
    canvas_width: int
    canvas_height: int


@router.get("/formations")
def list_formations() -> LineupFormationsResponse:
    return LineupFormationsResponse(
        formations=formation_keys(),
        labels_by_formation={key: layout.label for key, layout in FORMATIONS.items()},
        slots_by_formation=formation_slot_map(),
        coords_by_formation={key: layout.coords for key, layout in FORMATIONS.items()},
        # Coords are laid out in the renderer's native, unscaled space.
        canvas_width=RENDER_WIDTH,
        canvas_height=RENDER_HEIGHT,
    )


@router.get("/drafts", response_model=list[LineupDraftView])
def list_lineup_drafts(user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
    drafts = (
        db.query(LineupDraft)
        .filter(LineupDraft.guild_id == settings.discord_guild_id)
        .order_by(LineupDraft.updated_at.desc())
        .all()
    )
    return [_draft_to_view(draft) for draft in drafts]


@router.post("/drafts", response_model=LineupDraftView)
def create_lineup_draft(payload: LineupDraftPayload, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
    draft = LineupDraft(
        guild_id=settings.discord_guild_id or "",
        title=payload.title,
        channel_id=payload.channel_id,
        formation=payload.formation,
        kickoff_at=payload.kickoff_at,
        mention_role_ids=json.dumps(payload.mention_role_ids),
        assignments=json.dumps(payload.assignments),
        created_by_discord_id=user.user_id,
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    record_audit_log(db, action="lineup.create_draft", entity_type="lineup_draft", entity_id=str(draft.id), actor_discord_id=user.user_id)
    return _draft_to_view(draft)


@router.put("/drafts/{draft_id}", response_model=LineupDraftView)
def update_lineup_draft(draft_id: int, payload: LineupDraftPayload, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
    draft = db.get(LineupDraft, draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Lineup draft not found")
    draft.title = payload.title
    draft.channel_id = payload.channel_id
    draft.formation = payload.formation
    draft.kickoff_at = payload.kickoff_at
    draft.mention_role_ids = json.dumps(payload.mention_role_ids)
    draft.assignments = json.dumps(payload.assignments)
    db.commit()
    db.refresh(draft)
    record_audit_log(db, action="lineup.update_draft", entity_type="lineup_draft", entity_id=str(draft_id), actor_discord_id=user.user_id)
    return _draft_to_view(draft)


@router.delete("/drafts/{draft_id}")
def delete_lineup_draft(draft_id: int, user: SessionUser = Depends(require_admin_session), db: Session = Depends(get_db)):
    draft = db.get(LineupDraft, draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Lineup draft not found")
    db.delete(draft)
    db.commit()
    record_audit_log(db, action="lineup.delete_draft", entity_type="lineup_draft", entity_id=str(draft_id), actor_discord_id=user.user_id)
    return {"ok": True}


def _render_payload(
    formation: str,
    title: str,
    players: dict[str, str],
    kickoff_at: datetime | None,
    primary_color: str | None,
    secondary_color: str | None,
    native: bool = False,
) -> bytes:
    if formation not in FORMATIONS:
        raise HTTPException(status_code=400, detail="Unknown formation")
    kickoff_text = f"Kickoff: {kickoff_at.isoformat()}" if kickoff_at else ""
    kickoff_rows = None
    if kickoff_at:
        dual = format_dual_kickoff_lines(kickoff_at)
        kickoff_rows = [
            {"flag": "ro", "text": dual[0].replace("🇷🇴 ", "")},
            {"flag": "uk", "text": dual[1].replace("🇬🇧 ", "")},
        ]
    return render_lineup_png(
        formation=formation,
        players=players,
        title=title,
        kickoff_text=kickoff_text,
        kickoff_rows=kickoff_rows,
        primary_color=primary_color or settings.lineup_primary_color,
        secondary_color=secondary_color or settings.lineup_secondary_color,
        width=settings.lineup_render_width,
        height=settings.lineup_render_height,
        show_slot_tags=settings.lineup_show_slot_tags,
        native=native,
    )


def _role_mentions(role_ids: list[str]) -> str:
    clean: list[str] = []
    for value in role_ids:
        role_id = str(value).strip()
        if role_id.isdigit():
            clean.append(f"<@&{role_id}>")
    return " ".join(clean)


async def _send_lineup(channel, payload: LineupSendRequest) -> LineupPostResponse:
    image = _render_payload(
        formation=payload.formation,
        title=payload.title,
        players=payload.players,
        kickoff_at=payload.kickoff_at,
        primary_color=payload.primary_color,
        secondary_color=payload.secondary_color,
    )

    mentions = _role_mentions(payload.mention_role_ids)
    content = mentions
    file_name = f"lineup-{payload.formation}.png"

    message = await send_image_message(channel, image, file_name, content=content)

    return LineupPostResponse(ok=True, channel_id=str(payload.channel_id), message_id=str(message.id))


@router.post("/render")
async def render_lineup(payload: LineupRenderRequest) -> Response:
    # Previews stay in the native, unscaled coordinate space so on-screen
    # markers line up exactly with the shirts drawn into the image.
    image = _render_payload(
        formation=payload.formation,
        title=payload.title,
        players=payload.players,
        kickoff_at=payload.kickoff_at,
        primary_color=payload.primary_color,
        secondary_color=payload.secondary_color,
        native=True,
    )
    return Response(content=image, media_type="image/png")


@router.post("/post", response_model=LineupPostResponse)
async def post_lineup(payload: LineupPostRequest, request: Request):
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

    send_payload = LineupSendRequest(
        channel_id=payload.channel_id,
        title=payload.title,
        formation=payload.formation,
        players=payload.players,
        kickoff_at=payload.kickoff_at,
        primary_color=payload.primary_color,
        secondary_color=payload.secondary_color,
    )
    return await _send_lineup(channel, send_payload)


@router.post("/send", response_model=LineupPostResponse)
async def send_lineup(payload: LineupSendRequest, request: Request):
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

    return await _send_lineup(channel, payload)
