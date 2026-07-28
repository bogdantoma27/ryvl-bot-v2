import asyncio
import logging
from datetime import datetime, timezone
from io import BytesIO
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import discord
from discord import app_commands, TextChannel
from discord.ext import commands

from app.attendance_service import cancel_event_by_message_id, close_event, create_series, remove_vote, reschedule_event, set_event_message_id, set_vote
from app.config import Settings
from app.db import SessionLocal
from app.lineup_renderer import render_lineup_png
from app.models import AttendanceSeries, VoteStatus
from app.schemas import AttendanceCreateRequest, AttendanceRescheduleRequest, AttendanceVoteRequest
from app.time_utils import format_dual_kickoff_lines

logger = logging.getLogger(__name__)
ATTENDANCE_BUTTON_PREFIX = "attendance_vote:"


def _truncate(value: str, limit: int = 1024) -> str:
    if len(value) <= limit:
        return value
    return f"{value[:limit - 3]}..."


def _count_votes(event: dict, status: str) -> int:
    return sum(1 for vote in event.get("votes", []) if vote.get("status") == status)


def _attendance_closed(event: dict) -> bool:
    status = str(event.get("status") or "").lower()
    return "closed" in status or "cancelled" in status


def _attendance_cancelled(event: dict) -> bool:
    status = str(event.get("status") or "").lower()
    return "cancelled" in status


def _names_for_status(event: dict, status: str) -> str:
    rows = [vote for vote in event.get("votes", []) if vote.get("status") == status]
    rows.sort(key=lambda vote: str(vote.get("updated_at") or ""))
    names = [str(vote.get("display_name") or "-") for vote in rows]
    if not names:
        return "-"
    return _truncate("\n".join(names))


def _attendance_embed(series: dict, event: dict) -> discord.Embed:
    dual_lines = format_dual_kickoff_lines(event["starts_at"])

    description_parts: list[str] = []
    if series.get("description"):
        description_parts.append(str(series["description"]))
        description_parts.append("")

    creator_id = str(series.get("created_by_discord_id") or "").strip()
    if creator_id and creator_id != "system":
        description_parts.append(f"Created by: <@{creator_id}>")
    else:
        description_parts.append("Created by: System")

    description_parts.extend(dual_lines)
    if not _attendance_closed(event):
        description_parts.append("Click one button below to set or change your response.")

    if _attendance_closed(event):
        description_parts.append("")
        if _attendance_cancelled(event):
            description_parts.append("**Responses are cancelled.**")
        else:
            description_parts.append("**Responses are closed.**")

    embed = discord.Embed(
        title=str(series.get("title") or "Attendance"),
        description="\n".join(description_parts),
        color=0x6B7280 if _attendance_closed(event) else 0x2563EB,
    )

    accepted = _count_votes(event, "accepted")
    declined = _count_votes(event, "declined")
    tentative = _count_votes(event, "tentative")
    embed.add_field(name=f"✅ Accept ({accepted})", value=_names_for_status(event, "accepted"), inline=True)
    embed.add_field(name=f"❌ Decline ({declined})", value=_names_for_status(event, "declined"), inline=True)
    embed.add_field(name=f"🟡 Tentative ({tentative})", value=_names_for_status(event, "tentative"), inline=True)

    updated_at = datetime.now(timezone.utc).astimezone().strftime("%d/%m/%Y, %H:%M:%S")
    embed.set_footer(text=f"Event ID: {event['id']} - Updated {updated_at}")
    return embed


def _attendance_buttons(event_id: int, *, disabled: bool) -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    view.add_item(discord.ui.Button(
        label="Accept",
        emoji="✅",
        style=discord.ButtonStyle.success,
        custom_id=f"{ATTENDANCE_BUTTON_PREFIX}{event_id}:accepted",
        disabled=disabled,
    ))
    view.add_item(discord.ui.Button(
        label="Decline",
        emoji="❌",
        style=discord.ButtonStyle.danger,
        custom_id=f"{ATTENDANCE_BUTTON_PREFIX}{event_id}:declined",
        disabled=disabled,
    ))
    view.add_item(discord.ui.Button(
        label="Tentative",
        emoji="🟡",
        style=discord.ButtonStyle.secondary,
        custom_id=f"{ATTENDANCE_BUTTON_PREFIX}{event_id}:tentative",
        disabled=disabled,
    ))
    return view


def _role_mentions(role_ids: list[str] | None) -> tuple[str | None, discord.AllowedMentions | None]:
    if not role_ids:
        return None, None
    cleaned: list[str] = []
    for role_id in role_ids:
        value = str(role_id).strip()
        if not value or not value.isdigit() or value in cleaned:
            continue
        cleaned.append(value)
    if not cleaned:
        return None, None
    return " ".join(f"<@&{role_id}>" for role_id in cleaned), discord.AllowedMentions(everyone=False, users=False, roles=True)


def _attendance_message_content(series: dict, event: dict) -> str:
    starts_at = int(event["starts_at"].timestamp())
    dual_lines = format_dual_kickoff_lines(event["starts_at"])
    accepted = _count_votes(event, "accepted")
    tentative = _count_votes(event, "tentative")
    declined = _count_votes(event, "declined")
    return (
        f"**{series['title']}**\n"
        f"Kickoff: <t:{starts_at}:F>\n"
        f"{dual_lines[0]}\n"
        f"{dual_lines[1]}\n"
        f"Event ID: `{event['id']}`\n"
        f"Accepted: {accepted} | Tentative: {tentative} | Declined: {declined}"
    )


async def _sync_attendance_message(bot: commands.Bot, db, event: dict) -> None:
    series = db.get(AttendanceSeries, int(event["series_id"]))
    if not series or not event.get("message_id"):
        return

    channel = bot.get_channel(int(series.channel_id))
    if channel is None:
        channel = await bot.fetch_channel(int(series.channel_id))
    if not hasattr(channel, "fetch_message"):
        return

    try:
        message = await channel.fetch_message(int(event["message_id"]))
    except discord.NotFound:
        return
    await message.edit(
        content=message.content or None,
        embed=_attendance_embed({
            "title": series.title,
            "description": series.description,
            "created_by_discord_id": series.created_by_discord_id,
        }, event),
        view=_attendance_buttons(int(event["id"]), disabled=_attendance_closed(event)),
    )


async def _delete_attendance_message(bot: commands.Bot, db, event: dict) -> None:
    if not event.get("message_id"):
        return
    series = db.get(AttendanceSeries, int(event["series_id"]))
    if not series:
        return

    channel = bot.get_channel(int(series.channel_id))
    if channel is None:
        channel = await bot.fetch_channel(int(series.channel_id))
    if not hasattr(channel, "fetch_message"):
        return

    try:
        message = await channel.fetch_message(int(event["message_id"]))
    except discord.NotFound:
        return
    await message.delete()


def _parse_datetime(date_raw: str, time_raw: str, timezone_name: str) -> datetime:
    try:
        local_zone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        local_zone = ZoneInfo("UTC")
    naive = datetime.strptime(f"{date_raw} {time_raw}", "%Y-%m-%d %H:%M")
    local = naive.replace(tzinfo=local_zone)
    return local.astimezone(ZoneInfo("UTC"))


class RyvlBot(commands.Bot):
    def __init__(self, settings: Settings):
        intents = discord.Intents.default()
        intents.guilds = True
        intents.members = True
        super().__init__(command_prefix="!", intents=intents)
        self.settings = settings

    async def setup_hook(self) -> None:
        @self.tree.command(name="ping", description="Health check")
        async def ping(interaction: discord.Interaction):
            await interaction.response.send_message("pong", ephemeral=True)

        @self.tree.command(name="attendance_create", description="Create attendance event")
        @app_commands.default_permissions(administrator=True)
        @app_commands.choices(
            recurrence=[
                app_commands.Choice(name="One time", value="none"),
                app_commands.Choice(name="Weekly", value="weekly"),
            ]
        )
        async def attendance_create(
            interaction: discord.Interaction,
            title: str,
            date: str,
            time: str,
            channel: Optional[TextChannel] = None,
            description: str = "Respond with accept, tentative or decline.",
            recurrence: str = "none",
            repeat_count: Optional[int] = None,
        ):
            await interaction.response.defer(ephemeral=True)
            channel_target = channel
            if channel_target is None and self.settings.default_attendance_channel_id:
                fetched = self.get_channel(int(self.settings.default_attendance_channel_id))
                if isinstance(fetched, TextChannel):
                    channel_target = fetched
            if channel_target is None:
                await interaction.followup.send("No channel provided and no default attendance channel configured.", ephemeral=True)
                return

            try:
                starts_at = _parse_datetime(date, time, self.settings.default_timezone)
            except ValueError:
                await interaction.followup.send("Invalid date/time. Use date YYYY-MM-DD and time HH:mm.", ephemeral=True)
                return

            if recurrence == "weekly" and repeat_count is not None and (repeat_count < 2 or repeat_count > 52):
                await interaction.followup.send("repeat_count must be between 2 and 52 for weekly events.", ephemeral=True)
                return

            with SessionLocal() as db:
                payload = AttendanceCreateRequest(
                    channel_id=str(channel_target.id),
                    title=title,
                    description=description,
                    timezone=self.settings.default_timezone,
                    starts_at=starts_at,
                    recurrence=recurrence,
                    repeat_count=repeat_count if recurrence == "weekly" else None,
                )
                series = create_series(
                    db,
                    payload,
                    guild_id=self.settings.discord_guild_id,
                    created_by_discord_id=str(interaction.user.id),
                )
                first_event = next((event for event in series.get("events", []) if event.get("occurrence_number") == 1), None)
                if first_event is None:
                    await interaction.followup.send("Could not create first attendance occurrence.", ephemeral=True)
                    return

                message = await self.post_attendance_message(
                    channel_id=int(channel_target.id),
                    series=series,
                    event=first_event,
                )
                set_event_message_id(db, int(first_event["id"]), str(message.id))

            await interaction.followup.send(
                f"Attendance created. Event ID `{first_event['id']}` posted in <#{channel_target.id}>.",
                ephemeral=True,
            )

        @self.tree.command(name="attendance_vote", description="Set your attendance vote for an event")
        @app_commands.choices(
            status=[
                app_commands.Choice(name="Accepted", value="accepted"),
                app_commands.Choice(name="Tentative", value="tentative"),
                app_commands.Choice(name="Declined", value="declined"),
            ]
        )
        async def attendance_vote(
            interaction: discord.Interaction,
            event_id: int,
            status: str,
        ):
            await interaction.response.defer(ephemeral=True)
            try:
                vote_status = VoteStatus(status)
            except ValueError:
                await interaction.followup.send("Invalid status.", ephemeral=True)
                return

            with SessionLocal() as db:
                try:
                    event = set_vote(
                        db,
                        event_id,
                        AttendanceVoteRequest(
                            user_discord_id=str(interaction.user.id),
                            display_name=interaction.user.display_name,
                            status=vote_status,
                        ),
                    )
                except LookupError:
                    await interaction.followup.send("Event not found.", ephemeral=True)
                    return
                except ValueError as error:
                    await interaction.followup.send(str(error), ephemeral=True)
                    return

                try:
                    await _sync_attendance_message(self, db, event)
                except Exception:
                    logger.exception("Failed to sync attendance message for event %s", event_id)

            await interaction.followup.send(f"Vote set to **{vote_status.value}** for event `{event_id}`.", ephemeral=True)

        @self.tree.command(name="attendance_reschedule", description="Reschedule an attendance event")
        @app_commands.default_permissions(administrator=True)
        @app_commands.choices(
            scope=[
                app_commands.Choice(name="Only this occurrence", value="this_occurrence_only"),
                app_commands.Choice(name="This and following", value="this_and_following"),
            ]
        )
        async def attendance_reschedule(
            interaction: discord.Interaction,
            event_id: int,
            date: str,
            time: str,
            scope: str = "this_occurrence_only",
        ):
            await interaction.response.defer(ephemeral=True)
            try:
                starts_at = _parse_datetime(date, time, self.settings.default_timezone)
            except ValueError:
                await interaction.followup.send("Invalid date/time. Use date YYYY-MM-DD and time HH:mm.", ephemeral=True)
                return

            with SessionLocal() as db:
                try:
                    event = reschedule_event(
                        db,
                        event_id,
                        AttendanceRescheduleRequest(starts_at=starts_at, scope=scope),
                    )
                except LookupError:
                    await interaction.followup.send("Event not found.", ephemeral=True)
                    return
                except ValueError as error:
                    await interaction.followup.send(str(error), ephemeral=True)
                    return

                try:
                    await _sync_attendance_message(self, db, event)
                except Exception:
                    logger.exception("Failed to sync attendance message for event %s", event_id)

            await interaction.followup.send(
                f"Event `{event_id}` rescheduled to {date} {time} ({self.settings.default_timezone}).",
                ephemeral=True,
            )

        @self.tree.command(name="attendance_close", description="Close an attendance event")
        @app_commands.default_permissions(administrator=True)
        async def attendance_close(interaction: discord.Interaction, event_id: int):
            await interaction.response.defer(ephemeral=True)
            with SessionLocal() as db:
                try:
                    event = close_event(db, event_id)
                except LookupError:
                    await interaction.followup.send("Event not found.", ephemeral=True)
                    return

                try:
                    await _sync_attendance_message(self, db, event)
                except Exception:
                    logger.exception("Failed to sync attendance message for event %s", event_id)

            await interaction.followup.send(f"Event `{event_id}` closed.", ephemeral=True)

        @self.tree.command(name="attendance_remove_vote", description="Remove a user's attendance vote")
        @app_commands.default_permissions(administrator=True)
        async def attendance_remove_vote(
            interaction: discord.Interaction,
            event_id: int,
            user: discord.Member,
        ):
            await interaction.response.defer(ephemeral=True)
            with SessionLocal() as db:
                try:
                    event = remove_vote(db, event_id, str(user.id))
                except LookupError:
                    await interaction.followup.send("Event not found.", ephemeral=True)
                    return
                except ValueError as error:
                    await interaction.followup.send(str(error), ephemeral=True)
                    return

                try:
                    await _sync_attendance_message(self, db, event)
                except Exception:
                    logger.exception("Failed to sync attendance message for event %s", event_id)

            await interaction.followup.send(
                f"Removed vote for <@{user.id}> from event `{event_id}`.",
                ephemeral=True,
            )

        @self.tree.command(name="lineup_post", description="Post lineup text to a channel")
        @app_commands.default_permissions(administrator=True)
        async def lineup_post(
            interaction: discord.Interaction,
            formation: str,
            title: str,
            channel: Optional[TextChannel] = None,
            date: Optional[str] = None,
            time: Optional[str] = None,
            players_json: Optional[str] = None,
        ):
            await interaction.response.defer(ephemeral=True)

            channel_target = channel
            if channel_target is None and self.settings.default_lineup_channel_id:
                fetched = self.get_channel(int(self.settings.default_lineup_channel_id))
                if isinstance(fetched, TextChannel):
                    channel_target = fetched
            if channel_target is None:
                await interaction.followup.send("No channel provided and no default lineup channel configured.", ephemeral=True)
                return

            kickoff_line = ""
            kickoff_iso = ""
            kickoff_lines: list[str] = []
            if date and time:
                try:
                    kickoff_at = _parse_datetime(date, time, self.settings.default_timezone)
                    kickoff_line = f"\nKickoff: <t:{int(kickoff_at.timestamp())}:F>"
                    kickoff_iso = kickoff_at.isoformat()
                    kickoff_lines = format_dual_kickoff_lines(kickoff_at)
                except ValueError:
                    await interaction.followup.send("Invalid date/time for kickoff.", ephemeral=True)
                    return

            players: dict[str, str] = {}
            if players_json:
                try:
                    import json

                    data = json.loads(players_json)
                    if isinstance(data, dict):
                        for key, value in data.items():
                            slot = str(key).strip().lower()
                            player = str(value).strip()
                            if slot and player:
                                players[slot] = player[:28]
                except Exception:
                    await interaction.followup.send("Invalid players_json. Use a JSON object like {\"gk\":\"Alex\"}.", ephemeral=True)
                    return

            try:
                image = render_lineup_png(
                    formation=formation.strip(),
                    players=players,
                    title=title.strip(),
                    kickoff_text=f"Kickoff: {kickoff_iso}" if kickoff_iso else "",
                    kickoff_rows=[
                        {"flag": "ro", "text": kickoff_lines[0].replace("🇷🇴 ", "")},
                        {"flag": "uk", "text": kickoff_lines[1].replace("🇬🇧 ", "")},
                    ] if kickoff_lines else None,
                )
            except ValueError as error:
                await interaction.followup.send(str(error), ephemeral=True)
                return

            dual_block = f"\n{kickoff_lines[0]}\n{kickoff_lines[1]}" if kickoff_lines else ""
            content = f"**{title.strip()}**\nFormation: `{formation.strip()}`{kickoff_line}{dual_block}"
            message = await channel_target.send(
                content=content,
                file=discord.File(BytesIO(image), filename=f"lineup-{formation.strip()}.png"),
            )
            await interaction.followup.send(
                f"Lineup posted in <#{channel_target.id}>. Message ID `{message.id}`.",
                ephemeral=True,
            )

        if self.settings.discord_guild_id:
            guild = discord.Object(id=int(self.settings.discord_guild_id))
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
            logger.info("Synced commands to guild %s", self.settings.discord_guild_id)
        else:
            await self.tree.sync()
            logger.info("Synced global commands")

    async def on_interaction(self, interaction: discord.Interaction) -> None:
        if interaction.type == discord.InteractionType.component:
            custom_id = str((interaction.data or {}).get("custom_id") or "")
            if custom_id.startswith(ATTENDANCE_BUTTON_PREFIX):
                await self._handle_attendance_vote_button(interaction, custom_id)
                return
        await super().on_interaction(interaction)

    async def _handle_attendance_vote_button(self, interaction: discord.Interaction, custom_id: str) -> None:
        raw = custom_id[len(ATTENDANCE_BUTTON_PREFIX):]
        event_id_raw, _, status_raw = raw.partition(":")
        if not event_id_raw.isdigit() or status_raw not in {"accepted", "declined", "tentative"}:
            await interaction.response.send_message("Invalid attendance button payload.", ephemeral=True)
            return

        await interaction.response.defer()
        with SessionLocal() as db:
            try:
                event = set_vote(
                    db,
                    int(event_id_raw),
                    AttendanceVoteRequest(
                        user_discord_id=str(interaction.user.id),
                        display_name=interaction.user.display_name,
                        status=VoteStatus(status_raw),
                    ),
                )
            except LookupError:
                await interaction.followup.send("Event not found.", ephemeral=True)
                return
            except ValueError as error:
                await interaction.followup.send(str(error), ephemeral=True)
                return

            try:
                await _sync_attendance_message(self, db, event)
            except Exception:
                logger.exception("Failed to sync attendance message for event %s", event_id_raw)

    async def post_attendance_message(
        self,
        *,
        channel_id: int,
        series: dict,
        event: dict,
        mention_role_ids: list[str] | None = None,
    ) -> discord.Message:
        channel = self.get_channel(channel_id)
        if channel is None:
            channel = await self.fetch_channel(channel_id)
        if not hasattr(channel, "send"):
            raise RuntimeError("Target channel cannot send messages")

        content, allowed_mentions = _role_mentions(mention_role_ids)
        return await channel.send(
            content=content,
            embed=_attendance_embed(series, event),
            view=_attendance_buttons(int(event["id"]), disabled=_attendance_closed(event)),
            allowed_mentions=allowed_mentions,
        )

    async def sync_attendance_event(self, db, event: dict) -> None:
        await _sync_attendance_message(self, db, event)

    async def delete_attendance_message(self, db, event: dict) -> None:
        await _delete_attendance_message(self, db, event)

    async def on_raw_message_delete(self, payload: discord.RawMessageDeleteEvent) -> None:
        with SessionLocal() as db:
            cancelled = cancel_event_by_message_id(db, str(payload.message_id))
            if cancelled:
                logger.info("Attendance event %s cancelled because Discord message %s was deleted", cancelled["id"], payload.message_id)


async def start_bot(settings: Settings) -> RyvlBot | None:
    if not settings.discord_token:
        logger.warning("DISCORD_TOKEN not set, skipping bot startup")
        return None

    bot = RyvlBot(settings)

    async def _runner() -> None:
        try:
            await bot.start(settings.discord_token)
        except Exception:
            logger.exception("Discord bot stopped unexpectedly")

    asyncio.create_task(_runner())
    return bot


async def stop_bot(bot: RyvlBot | None) -> None:
    if bot is None:
        return
    await bot.close()
