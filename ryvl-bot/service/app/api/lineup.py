from datetime import datetime
from io import BytesIO

import discord
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from app.auth import require_admin_session
from app.config import get_settings
from app.lineup_formations import FORMATIONS, formation_keys
from app.lineup_formations import slots_by_formation as formation_slot_map
from app.lineup_renderer import render_lineup_png
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
    message_prefix: str | None = None
    message_suffix: str | None = None
    filename: str | None = None


class LineupFormationsResponse(BaseModel):
    formations: list[str]
    slots_by_formation: dict[str, list[str]]


@router.get("/formations")
def list_formations() -> LineupFormationsResponse:
    return LineupFormationsResponse(
        formations=formation_keys(),
        slots_by_formation=formation_slot_map(),
    )


def _render_payload(
    formation: str,
    title: str,
    players: dict[str, str],
    kickoff_at: datetime | None,
    primary_color: str | None,
    secondary_color: str | None,
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

    kickoff_line = f"\nKickoff: <t:{int(payload.kickoff_at.timestamp())}:F>" if payload.kickoff_at else ""
    dual_block = ""
    if payload.kickoff_at:
        dual_lines = format_dual_kickoff_lines(payload.kickoff_at)
        dual_block = f"\n{dual_lines[0]}\n{dual_lines[1]}"
    mentions = _role_mentions(payload.mention_role_ids)
    prefix = f"{payload.message_prefix.strip()}\n" if payload.message_prefix else ""
    suffix = f"\n{payload.message_suffix.strip()}" if payload.message_suffix else ""
    mention_line = f"{mentions}\n" if mentions else ""

    content = (
        f"{prefix}"
        f"{mention_line}"
        f"**{payload.title.strip()}**\n"
        f"Formation: `{payload.formation.strip()}`"
        f"{kickoff_line}"
        f"{dual_block}"
        f"{suffix}"
    )
    file_name = (payload.filename or f"lineup-{payload.formation}.png").strip() or f"lineup-{payload.formation}.png"
    if not file_name.lower().endswith(".png"):
        file_name = f"{file_name}.png"

    message = await channel.send(
        content=content,
        file=discord.File(BytesIO(image), filename=file_name),
    )

    return LineupPostResponse(ok=True, channel_id=str(payload.channel_id), message_id=str(message.id))


@router.post("/render")
async def render_lineup(payload: LineupRenderRequest) -> Response:
    image = _render_payload(
        formation=payload.formation,
        title=payload.title,
        players=payload.players,
        kickoff_at=payload.kickoff_at,
        primary_color=payload.primary_color,
        secondary_color=payload.secondary_color,
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
