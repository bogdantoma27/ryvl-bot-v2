import asyncio
import logging
import re
from datetime import datetime, timezone
from io import BytesIO
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import discord
from discord import app_commands, TextChannel
from discord.ext import commands

from app.attendance_service import cancel_event_by_message_id, close_event, create_series, mark_event_open_with_message, remove_vote, reschedule_event, set_vote
from app.config import Settings
from app.db import SessionLocal
from app.lineup_formations import FORMATIONS
from app.lineup_renderer import render_lineup_png
from app.models import AttendanceSeries, VoteStatus
from app.schemas import AttendanceCreateRequest, AttendanceRescheduleRequest, AttendanceVoteRequest
from app.time_utils import format_dual_kickoff_lines

logger = logging.getLogger(__name__)
ATTENDANCE_BUTTON_PREFIX = "attendance_vote:"


class LineupSetupModal(discord.ui.Modal, title="Lineup Setup"):
    formation = discord.ui.TextInput(
        label="Formation key (example: 4231)",
        placeholder="Use one of the supported formation keys",
        required=True,
        max_length=32,
    )
    lineup_title = discord.ui.TextInput(
        label="Lineup title",
        placeholder="Example: RYVL Match Lineup",
        required=True,
        max_length=120,
    )
    kickoff_date = discord.ui.TextInput(
        label="Kickoff date (optional, YYYY-MM-DD)",
        required=False,
        max_length=10,
    )
    kickoff_time = discord.ui.TextInput(
        label="Kickoff time (optional, HH:mm)",
        required=False,
        max_length=5,
    )

    def __init__(self, *, formation: str = "", title_value: str = "", date: str = "", time: str = ""):
        super().__init__(timeout=300)
        self.formation.default = formation
        self.lineup_title.default = title_value
        self.kickoff_date.default = date
        self.kickoff_time.default = time
        self.submitted = False

    async def on_submit(self, interaction: discord.Interaction) -> None:
        self.submitted = True
        await interaction.response.defer(ephemeral=True)
        self.stop()


class LineupCustomNameModal(discord.ui.Modal, title="Set Custom Player Name"):
    player_name = discord.ui.TextInput(
        label="Player name",
        placeholder="Type any display name",
        required=True,
        max_length=28,
    )

    def __init__(self, *, slot_label: str):
        super().__init__(timeout=300)
        self.player_name.label = f"Player name for {slot_label}"
        self.submitted = False
        self.value = ""

    async def on_submit(self, interaction: discord.Interaction) -> None:
        self.submitted = True
        self.value = str(self.player_name.value or "").strip()[:28]
        await interaction.response.defer(ephemeral=True)
        self.stop()


class LineupMemberSelect(discord.ui.UserSelect):
    def __init__(self):
        super().__init__(placeholder="Choose a member for current slot", min_values=1, max_values=1)

    async def callback(self, interaction: discord.Interaction) -> None:
        view = self.view
        if not isinstance(view, LineupWizardView):
            return
        await view.handle_member_select(interaction, self)


class LineupWizardView(discord.ui.View):
    def __init__(
        self,
        *,
        bot: commands.Bot,
        owner_id: int,
        channel_id: int,
        formation_key: str,
        title: str,
        kickoff_at: datetime | None,
    ):
        super().__init__(timeout=900)
        self.bot = bot
        self.owner_id = owner_id
        self.channel_id = channel_id
        self.formation_key = formation_key
        self.title = title
        self.kickoff_at = kickoff_at
        self.layout = FORMATIONS[formation_key]
        self.slot_order = [position.key for position in self.layout.positions]
        self.current_index = 0
        self.players: dict[str, str] = {}
        self.message: discord.Message | None = None

        self.add_item(LineupMemberSelect())

    def _is_owner(self, interaction: discord.Interaction) -> bool:
        return interaction.user.id == self.owner_id

    def _current_slot_key(self) -> str:
        return self.slot_order[self.current_index]

    def _current_slot_label(self) -> str:
        slot_key = self._current_slot_key()
        return next((position.label for position in self.layout.positions if position.key == slot_key), slot_key.upper())

    def _progress_text(self) -> str:
        current = self.current_index + 1
        total = len(self.slot_order)
        lines = [
            f"**Lineup wizard** - `{self.layout.label}`",
            f"Title: **{self.title}**",
            f"Target channel: <#{self.channel_id}>",
            f"Step {current}/{total}: choose player for **{self._current_slot_label()}** (`{self._current_slot_key()}`)",
            "Use either member select, custom name, or skip this slot.",
        ]
        if self.players:
            preview = ", ".join(f"{key.upper()}: {value}" for key, value in self.players.items())
            lines.append(f"Selected: {preview}")
        return "\n".join(lines)

    async def _refresh_message(self) -> None:
        if self.message is None:
            return
        await self.message.edit(content=self._progress_text(), view=self)

    async def _advance(self) -> None:
        if self.current_index < len(self.slot_order) - 1:
            self.current_index += 1
            await self._refresh_message()
            return
        await self._finish()

    async def _go_back(self) -> None:
        if self.current_index <= 0:
            await self._refresh_message()
            return
        self.current_index -= 1
        await self._refresh_message()

    async def _finish(self) -> None:
        kickoff_line = ""
        kickoff_iso = ""
        kickoff_lines: list[str] = []
        if self.kickoff_at is not None:
            kickoff_line = f"\nKickoff: <t:{int(self.kickoff_at.timestamp())}:F>"
            kickoff_iso = self.kickoff_at.isoformat()
            kickoff_lines = format_dual_kickoff_lines(self.kickoff_at)

        image = render_lineup_png(
            formation=self.formation_key,
            players=self.players,
            title=self.title,
            kickoff_text=f"Kickoff: {kickoff_iso}" if kickoff_iso else "",
            kickoff_rows=[
                {"flag": "ro", "text": kickoff_lines[0].replace("🇷🇴 ", "")},
                {"flag": "uk", "text": kickoff_lines[1].replace("🇬🇧 ", "")},
            ] if kickoff_lines else None,
        )

        channel = self.bot.get_channel(self.channel_id)
        if channel is None:
            channel = await self.bot.fetch_channel(self.channel_id)
        if not hasattr(channel, "send"):
            raise RuntimeError("Target channel cannot send messages")

        dual_block = f"\n{kickoff_lines[0]}\n{kickoff_lines[1]}" if kickoff_lines else ""
        content = f"**{self.title}**\nFormation: `{self.formation_key}`{kickoff_line}{dual_block}"
        message = await channel.send(
            content=content,
            file=discord.File(BytesIO(image), filename=f"lineup-{self.formation_key}.png"),
        )
        if self.message is not None:
            await self.message.edit(
                content=f"Lineup posted in <#{self.channel_id}>. Message ID `{message.id}`.",
                view=None,
            )
        self.stop()

    async def handle_member_select(self, interaction: discord.Interaction, select: LineupMemberSelect) -> None:
        if not self._is_owner(interaction):
            await interaction.response.send_message("Only the command author can use this lineup wizard.", ephemeral=True)
            return
        member = select.values[0]
        name = getattr(member, "display_name", None) or getattr(member, "name", "")
        slot = self._current_slot_key()
        self.players[slot] = str(name).strip()[:28]
        await interaction.response.defer(ephemeral=True)
        await self._advance()

    @discord.ui.button(label="Type Custom Name", style=discord.ButtonStyle.secondary)
    async def set_custom_name(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        if not self._is_owner(interaction):
            await interaction.response.send_message("Only the command author can use this lineup wizard.", ephemeral=True)
            return
        modal = LineupCustomNameModal(slot_label=self._current_slot_label())
        await interaction.response.send_modal(modal)
        timed_out = await modal.wait()
        if timed_out or not modal.submitted or not modal.value:
            return
        self.players[self._current_slot_key()] = modal.value
        await self._advance()

    @discord.ui.button(label="Skip Slot", style=discord.ButtonStyle.primary)
    async def skip_slot(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        if not self._is_owner(interaction):
            await interaction.response.send_message("Only the command author can use this lineup wizard.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        await self._advance()

    @discord.ui.button(label="Back", style=discord.ButtonStyle.secondary)
    async def back(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        if not self._is_owner(interaction):
            await interaction.response.send_message("Only the command author can use this lineup wizard.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        await self._go_back()

    @discord.ui.button(label="Reset Current Slot", style=discord.ButtonStyle.secondary)
    async def reset_current_slot(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        if not self._is_owner(interaction):
            await interaction.response.send_message("Only the command author can use this lineup wizard.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        self.players.pop(self._current_slot_key(), None)
        await self._refresh_message()

    @discord.ui.button(label="Finish Now", style=discord.ButtonStyle.success)
    async def finish_now(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        if not self._is_owner(interaction):
            await interaction.response.send_message("Only the command author can use this lineup wizard.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        await self._finish()

    @discord.ui.button(label="Cancel", style=discord.ButtonStyle.danger)
    async def cancel(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        if not self._is_owner(interaction):
            await interaction.response.send_message("Only the command author can use this lineup wizard.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        if self.message is not None:
            await self.message.edit(content="Lineup wizard cancelled.", view=None)
        self.stop()

    async def on_timeout(self) -> None:
        if self.message is not None:
            try:
                await self.message.edit(content="Lineup wizard expired. Please run /lineup_post again.", view=None)
            except Exception:
                pass


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
        class AttendanceCreateModal(discord.ui.Modal, title="Attendance - Create Event"):
            title_input = discord.ui.TextInput(
                label="Title",
                placeholder="Example: RYVL Training",
                required=True,
                max_length=120,
            )
            date_input = discord.ui.TextInput(
                label="Date (YYYY-MM-DD)",
                required=True,
                max_length=10,
            )
            time_input = discord.ui.TextInput(
                label="Time (HH:mm)",
                required=True,
                max_length=5,
            )
            description_input = discord.ui.TextInput(
                label="Description",
                placeholder="Respond with accept, tentative or decline.",
                required=False,
                max_length=400,
                style=discord.TextStyle.paragraph,
            )
            recurrence_input = discord.ui.TextInput(
                label="Recurrence and repeat_count (none|weekly)",
                placeholder="Examples: none  OR  weekly 6",
                required=False,
                max_length=32,
            )
            publish_time_input = discord.ui.TextInput(
                label="Publish time (HH:mm, optional)",
                placeholder="Example: 18:00",
                required=False,
                max_length=5,
            )

            def __init__(self):
                super().__init__(timeout=300)
                self.submitted = False

            async def on_submit(self, interaction: discord.Interaction) -> None:
                self.submitted = True
                await interaction.response.defer(ephemeral=True)
                self.stop()

        class AttendanceVoteModal(discord.ui.Modal, title="Attendance - Set Vote"):
            event_id_input = discord.ui.TextInput(label="Event ID", required=True, max_length=32)
            status_input = discord.ui.TextInput(
                label="Status (accepted|tentative|declined)",
                required=True,
                max_length=16,
            )

            def __init__(self):
                super().__init__(timeout=300)
                self.submitted = False

            async def on_submit(self, interaction: discord.Interaction) -> None:
                self.submitted = True
                await interaction.response.defer(ephemeral=True)
                self.stop()

        class AttendanceRescheduleModal(discord.ui.Modal, title="Attendance - Reschedule"):
            event_id_input = discord.ui.TextInput(label="Event ID", required=True, max_length=32)
            date_input = discord.ui.TextInput(label="New date (YYYY-MM-DD)", required=True, max_length=10)
            time_input = discord.ui.TextInput(label="New time (HH:mm)", required=True, max_length=5)
            publish_time_input = discord.ui.TextInput(
                label="Publish time (HH:mm, optional)",
                placeholder="Example: 18:00",
                required=False,
                max_length=5,
            )
            scope_input = discord.ui.TextInput(
                label="Scope (this_occurrence_only|this_and_following)",
                required=False,
                max_length=32,
            )

            def __init__(self):
                super().__init__(timeout=300)
                self.submitted = False

            async def on_submit(self, interaction: discord.Interaction) -> None:
                self.submitted = True
                await interaction.response.defer(ephemeral=True)
                self.stop()

        class AttendanceCloseModal(discord.ui.Modal, title="Attendance - Close Event"):
            event_id_input = discord.ui.TextInput(label="Event ID", required=True, max_length=32)

            def __init__(self):
                super().__init__(timeout=300)
                self.submitted = False

            async def on_submit(self, interaction: discord.Interaction) -> None:
                self.submitted = True
                await interaction.response.defer(ephemeral=True)
                self.stop()

        class AttendanceRemoveVoteModal(discord.ui.Modal, title="Attendance - Remove Vote"):
            event_id_input = discord.ui.TextInput(label="Event ID", required=True, max_length=32)
            user_input = discord.ui.TextInput(
                label="User mention or user ID",
                placeholder="Example: @Player or 1234567890",
                required=True,
                max_length=64,
            )

            def __init__(self):
                super().__init__(timeout=300)
                self.submitted = False

            async def on_submit(self, interaction: discord.Interaction) -> None:
                self.submitted = True
                await interaction.response.defer(ephemeral=True)
                self.stop()

        class AttendanceWizardView(discord.ui.View):
            def __init__(self, *, bot: "RyvlBot", owner_id: int):
                super().__init__(timeout=900)
                self.bot = bot
                self.owner_id = owner_id
                self.message: discord.Message | None = None

            def _is_owner(self, interaction: discord.Interaction) -> bool:
                return interaction.user.id == self.owner_id

            def _text(self) -> str:
                return (
                    "**Attendance Wizard**\n"
                    "Choose an action below.\n"
                    "- Create: new attendance event\n"
                    "- Vote: set your response\n"
                    "- Reschedule: move an event\n"
                    "- Close: close responses\n"
                    "- Remove Vote: remove a user vote"
                )

            async def _send_owner_only(self, interaction: discord.Interaction) -> bool:
                if self._is_owner(interaction):
                    return True
                await interaction.response.send_message("Only the command author can use this attendance wizard.", ephemeral=True)
                return False

            async def _resolve_channel(self, interaction: discord.Interaction) -> TextChannel | None:
                if self.bot.settings.default_attendance_channel_id:
                    fetched = self.bot.get_channel(int(self.bot.settings.default_attendance_channel_id))
                    if isinstance(fetched, TextChannel):
                        return fetched
                if isinstance(interaction.channel, TextChannel):
                    return interaction.channel
                return None

            @discord.ui.button(label="Create", style=discord.ButtonStyle.success)
            async def create_action(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
                if not await self._send_owner_only(interaction):
                    return
                modal = AttendanceCreateModal()
                await interaction.response.send_modal(modal)
                timed_out = await modal.wait()
                if timed_out or not modal.submitted:
                    return

                channel_target = await self._resolve_channel(interaction)
                if channel_target is None:
                    await interaction.followup.send("No target channel found. Configure default attendance channel.", ephemeral=True)
                    return

                title = str(modal.title_input.value or "").strip()
                date_raw = str(modal.date_input.value or "").strip()
                time_raw = str(modal.time_input.value or "").strip()
                description = str(modal.description_input.value or "Respond with accept, tentative or decline.").strip() or "Respond with accept, tentative or decline."
                recurrence_raw = str(modal.recurrence_input.value or "none").strip().lower()
                publish_time_raw = str(modal.publish_time_input.value or "").strip()
                recurrence = "none"
                repeat_count: int | None = None
                parts = recurrence_raw.split()
                if parts:
                    recurrence = parts[0] if parts[0] in {"none", "weekly"} else "none"
                    if recurrence == "weekly" and len(parts) > 1 and parts[1].isdigit():
                        repeat_count = int(parts[1])

                try:
                    starts_at = _parse_datetime(date_raw, time_raw, self.bot.settings.default_timezone)
                except ValueError:
                    await interaction.followup.send("Invalid date/time. Use YYYY-MM-DD and HH:mm.", ephemeral=True)
                    return

                if recurrence == "weekly" and repeat_count is not None and (repeat_count < 2 or repeat_count > 52):
                    await interaction.followup.send("repeat_count must be between 2 and 52 for weekly events.", ephemeral=True)
                    return

                if publish_time_raw and not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", publish_time_raw):
                    await interaction.followup.send("Publish time must use HH:mm.", ephemeral=True)
                    return

                with SessionLocal() as db:
                    payload = AttendanceCreateRequest(
                        channel_id=str(channel_target.id),
                        title=title,
                        description=description,
                        timezone=self.bot.settings.default_timezone,
                        starts_at=starts_at,
                        publish_time=publish_time_raw or None,
                        recurrence=recurrence,
                        repeat_count=repeat_count if recurrence == "weekly" else None,
                    )
                    series = create_series(
                        db,
                        payload,
                        guild_id=self.bot.settings.discord_guild_id,
                        created_by_discord_id=str(interaction.user.id),
                    )
                    first_event = next((event for event in series.get("events", []) if event.get("occurrence_number") == 1), None)
                    if first_event is None:
                        await interaction.followup.send("Could not create first attendance occurrence.", ephemeral=True)
                        return
                    if first_event.get("publish_at") and first_event["publish_at"] <= datetime.now(timezone.utc):
                        message = await self.bot.post_attendance_message(
                            channel_id=int(channel_target.id),
                            series=series,
                            event=first_event,
                        )
                        mark_event_open_with_message(db, int(first_event["id"]), str(message.id))
                        await interaction.followup.send(
                            f"Attendance created. Event ID `{first_event['id']}` posted in <#{channel_target.id}>.",
                            ephemeral=True,
                        )
                    else:
                        await interaction.followup.send(
                            f"Attendance created. Event ID `{first_event['id']}` is scheduled and will publish at configured appearance time.",
                            ephemeral=True,
                        )

            @discord.ui.button(label="Vote", style=discord.ButtonStyle.primary)
            async def vote_action(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
                if not await self._send_owner_only(interaction):
                    return
                modal = AttendanceVoteModal()
                await interaction.response.send_modal(modal)
                timed_out = await modal.wait()
                if timed_out or not modal.submitted:
                    return

                event_raw = str(modal.event_id_input.value or "").strip()
                status_raw = str(modal.status_input.value or "").strip().lower()
                if not event_raw.isdigit():
                    await interaction.followup.send("Event ID must be numeric.", ephemeral=True)
                    return
                try:
                    vote_status = VoteStatus(status_raw)
                except ValueError:
                    await interaction.followup.send("Status must be accepted, tentative, or declined.", ephemeral=True)
                    return

                with SessionLocal() as db:
                    try:
                        event = set_vote(
                            db,
                            int(event_raw),
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
                        await _sync_attendance_message(self.bot, db, event)
                    except Exception:
                        logger.exception("Failed to sync attendance message for event %s", event_raw)

                await interaction.followup.send(f"Vote set to **{vote_status.value}** for event `{event_raw}`.", ephemeral=True)

            @discord.ui.button(label="Reschedule", style=discord.ButtonStyle.primary)
            async def reschedule_action(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
                if not await self._send_owner_only(interaction):
                    return
                modal = AttendanceRescheduleModal()
                await interaction.response.send_modal(modal)
                timed_out = await modal.wait()
                if timed_out or not modal.submitted:
                    return

                event_raw = str(modal.event_id_input.value or "").strip()
                date_raw = str(modal.date_input.value or "").strip()
                time_raw = str(modal.time_input.value or "").strip()
                scope_raw = str(modal.scope_input.value or "this_occurrence_only").strip() or "this_occurrence_only"
                publish_time_raw = str(modal.publish_time_input.value or "").strip()
                if scope_raw not in {"this_occurrence_only", "this_and_following"}:
                    scope_raw = "this_occurrence_only"
                if not event_raw.isdigit():
                    await interaction.followup.send("Event ID must be numeric.", ephemeral=True)
                    return
                if publish_time_raw and not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", publish_time_raw):
                    await interaction.followup.send("Publish time must use HH:mm.", ephemeral=True)
                    return
                try:
                    starts_at = _parse_datetime(date_raw, time_raw, self.bot.settings.default_timezone)
                except ValueError:
                    await interaction.followup.send("Invalid date/time. Use YYYY-MM-DD and HH:mm.", ephemeral=True)
                    return

                with SessionLocal() as db:
                    try:
                        event = reschedule_event(
                            db,
                            int(event_raw),
                            AttendanceRescheduleRequest(
                                starts_at=starts_at,
                                publish_time=publish_time_raw or None,
                                scope=scope_raw,
                            ),
                        )
                    except LookupError:
                        await interaction.followup.send("Event not found.", ephemeral=True)
                        return
                    except ValueError as error:
                        await interaction.followup.send(str(error), ephemeral=True)
                        return
                    try:
                        await _sync_attendance_message(self.bot, db, event)
                    except Exception:
                        logger.exception("Failed to sync attendance message for event %s", event_raw)

                await interaction.followup.send(
                    f"Event `{event_raw}` rescheduled to {date_raw} {time_raw} ({self.bot.settings.default_timezone}).",
                    ephemeral=True,
                )

            @discord.ui.button(label="Close", style=discord.ButtonStyle.secondary)
            async def close_action(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
                if not await self._send_owner_only(interaction):
                    return
                modal = AttendanceCloseModal()
                await interaction.response.send_modal(modal)
                timed_out = await modal.wait()
                if timed_out or not modal.submitted:
                    return

                event_raw = str(modal.event_id_input.value or "").strip()
                if not event_raw.isdigit():
                    await interaction.followup.send("Event ID must be numeric.", ephemeral=True)
                    return

                with SessionLocal() as db:
                    try:
                        event = close_event(db, int(event_raw))
                    except LookupError:
                        await interaction.followup.send("Event not found.", ephemeral=True)
                        return
                    try:
                        await _sync_attendance_message(self.bot, db, event)
                    except Exception:
                        logger.exception("Failed to sync attendance message for event %s", event_raw)

                await interaction.followup.send(f"Event `{event_raw}` closed.", ephemeral=True)

            @discord.ui.button(label="Remove Vote", style=discord.ButtonStyle.secondary)
            async def remove_vote_action(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
                if not await self._send_owner_only(interaction):
                    return
                modal = AttendanceRemoveVoteModal()
                await interaction.response.send_modal(modal)
                timed_out = await modal.wait()
                if timed_out or not modal.submitted:
                    return

                event_raw = str(modal.event_id_input.value or "").strip()
                user_raw = str(modal.user_input.value or "").strip()
                if not event_raw.isdigit():
                    await interaction.followup.send("Event ID must be numeric.", ephemeral=True)
                    return

                match = re.search(r"(\d{5,})", user_raw)
                if not match:
                    await interaction.followup.send("User must be a mention or a numeric user ID.", ephemeral=True)
                    return
                user_id = match.group(1)

                with SessionLocal() as db:
                    try:
                        event = remove_vote(db, int(event_raw), str(user_id))
                    except LookupError:
                        await interaction.followup.send("Event not found.", ephemeral=True)
                        return
                    except ValueError as error:
                        await interaction.followup.send(str(error), ephemeral=True)
                        return
                    try:
                        await _sync_attendance_message(self.bot, db, event)
                    except Exception:
                        logger.exception("Failed to sync attendance message for event %s", event_raw)

                await interaction.followup.send(
                    f"Removed vote for <@{user_id}> from event `{event_raw}`.",
                    ephemeral=True,
                )

            @discord.ui.button(label="Close Wizard", style=discord.ButtonStyle.danger)
            async def close_wizard(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
                if not await self._send_owner_only(interaction):
                    return
                await interaction.response.defer(ephemeral=True)
                if self.message is not None:
                    await self.message.edit(content="Attendance wizard closed.", view=None)
                self.stop()

            async def on_timeout(self) -> None:
                if self.message is not None:
                    try:
                        await self.message.edit(content="Attendance wizard expired. Run /attendance_wizard again.", view=None)
                    except Exception:
                        pass

        async def formation_autocomplete(_: discord.Interaction, current: str) -> list[app_commands.Choice[str]]:
            value = str(current or "").strip().lower()
            matches: list[app_commands.Choice[str]] = []
            for key in sorted(FORMATIONS.keys()):
                label = FORMATIONS[key].label
                searchable = f"{key} {label}".lower()
                if value and value not in searchable:
                    continue
                matches.append(app_commands.Choice(name=f"{label} ({key})", value=key))
                if len(matches) >= 25:
                    break
            return matches

        @self.tree.command(name="ping", description="Health check")
        async def ping(interaction: discord.Interaction):
            await interaction.response.send_message("pong", ephemeral=True)

        @self.tree.command(name="attendance_create", description="Create attendance event")
        @app_commands.default_permissions(administrator=True)
        @app_commands.describe(
            title="Public title shown in Discord for this attendance event",
            date="Kickoff date in YYYY-MM-DD format",
            time="Kickoff time in HH:mm format (24h)",
            publish_time="Optional HH:mm when event should appear (not kickoff)",
            channel="Target Discord text channel (optional if default attendance channel is configured)",
            description="Optional details shown under the attendance title",
            recurrence="Choose one time or weekly recurrence",
            repeat_count="For weekly recurrence only: how many occurrences (2-52)",
        )
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
            publish_time: Optional[str] = None,
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
            publish_time_value = str(publish_time or "").strip() or None
            if publish_time_value and not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", publish_time_value):
                await interaction.followup.send("Publish time must use HH:mm.", ephemeral=True)
                return

            with SessionLocal() as db:
                payload = AttendanceCreateRequest(
                    channel_id=str(channel_target.id),
                    title=title,
                    description=description,
                    timezone=self.settings.default_timezone,
                    starts_at=starts_at,
                    publish_time=publish_time_value,
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
                if first_event.get("publish_at") and first_event["publish_at"] <= datetime.now(timezone.utc):
                    message = await self.post_attendance_message(
                        channel_id=int(channel_target.id),
                        series=series,
                        event=first_event,
                    )
                    mark_event_open_with_message(db, int(first_event["id"]), str(message.id))
                    await interaction.followup.send(
                        f"Attendance created. Event ID `{first_event['id']}` posted in <#{channel_target.id}>.",
                        ephemeral=True,
                    )
                else:
                    await interaction.followup.send(
                        f"Attendance created. Event ID `{first_event['id']}` is scheduled and will publish at configured appearance time.",
                        ephemeral=True,
                    )

        @self.tree.command(name="attendance_vote", description="Set your attendance vote for an event")
        @app_commands.describe(
            event_id="Attendance event ID visible in the attendance message footer",
            status="Your response for the selected attendance event",
        )
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
        @app_commands.describe(
            event_id="Attendance event ID to reschedule",
            date="New kickoff date in YYYY-MM-DD format",
            time="New kickoff time in HH:mm format (24h)",
            publish_time="Optional HH:mm when event should appear (not kickoff)",
            scope="Apply only to this occurrence or to this and following ones",
        )
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
            publish_time: Optional[str] = None,
            scope: str = "this_occurrence_only",
        ):
            await interaction.response.defer(ephemeral=True)
            try:
                starts_at = _parse_datetime(date, time, self.settings.default_timezone)
            except ValueError:
                await interaction.followup.send("Invalid date/time. Use date YYYY-MM-DD and time HH:mm.", ephemeral=True)
                return
            publish_time_value = str(publish_time or "").strip() or None
            if publish_time_value and not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", publish_time_value):
                await interaction.followup.send("Publish time must use HH:mm.", ephemeral=True)
                return

            with SessionLocal() as db:
                try:
                    event = reschedule_event(
                        db,
                        event_id,
                        AttendanceRescheduleRequest(
                            starts_at=starts_at,
                            publish_time=publish_time_value,
                            scope=scope,
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

            await interaction.followup.send(
                f"Event `{event_id}` rescheduled to {date} {time} ({self.settings.default_timezone}).",
                ephemeral=True,
            )

        @self.tree.command(name="attendance_close", description="Close an attendance event")
        @app_commands.default_permissions(administrator=True)
        @app_commands.describe(event_id="Attendance event ID to close")
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
        @app_commands.describe(
            event_id="Attendance event ID from which to remove a vote",
            user="Server member whose vote will be removed",
        )
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

        @self.tree.command(name="lineup_post", description="Open step-by-step lineup wizard and post to a channel")
        @app_commands.default_permissions(administrator=True)
        @app_commands.describe(
            channel="Target Discord text channel (optional if default lineup channel is configured)",
            formation="Formation key (for example 4231). Optional - can be set in wizard",
            title="Lineup title shown in Discord and on image. Optional - can be set in wizard",
            date="Kickoff date YYYY-MM-DD (optional)",
            time="Kickoff time HH:mm (optional)",
        )
        @app_commands.autocomplete(formation=formation_autocomplete)
        async def lineup_post(
            interaction: discord.Interaction,
            channel: Optional[TextChannel] = None,
            formation: Optional[str] = None,
            title: Optional[str] = None,
            date: Optional[str] = None,
            time: Optional[str] = None,
        ):
            channel_target = channel
            if channel_target is None and self.settings.default_lineup_channel_id:
                fetched = self.get_channel(int(self.settings.default_lineup_channel_id))
                if isinstance(fetched, TextChannel):
                    channel_target = fetched
            if channel_target is None:
                await interaction.response.send_message("No channel provided and no default lineup channel configured.", ephemeral=True)
                return

            formation_value = str(formation or "").strip().lower()
            title_value = str(title or "").strip()
            date_value = str(date or "").strip()
            time_value = str(time or "").strip()

            if not formation_value or not title_value:
                modal = LineupSetupModal(
                    formation=formation_value,
                    title_value=title_value,
                    date=date_value,
                    time=time_value,
                )
                await interaction.response.send_modal(modal)
                timed_out = await modal.wait()
                if timed_out or not modal.submitted:
                    return
                formation_value = str(modal.formation.value or "").strip().lower()
                title_value = str(modal.lineup_title.value or "").strip()
                date_value = str(modal.kickoff_date.value or "").strip()
                time_value = str(modal.kickoff_time.value or "").strip()
            else:
                await interaction.response.defer(ephemeral=True)

            if formation_value not in FORMATIONS:
                help_values = ", ".join(sorted(FORMATIONS.keys())[:20])
                await interaction.followup.send(
                    f"Unknown formation `{formation_value}`. Example valid keys: {help_values}",
                    ephemeral=True,
                )
                return

            kickoff_at: datetime | None = None
            if date_value and time_value:
                try:
                    kickoff_at = _parse_datetime(date_value, time_value, self.settings.default_timezone)
                except ValueError:
                    await interaction.followup.send("Invalid date/time for kickoff. Use YYYY-MM-DD and HH:mm.", ephemeral=True)
                    return
            elif date_value or time_value:
                await interaction.followup.send("Please provide both date and time, or leave both empty.", ephemeral=True)
                return

            wizard = LineupWizardView(
                bot=self,
                owner_id=interaction.user.id,
                channel_id=channel_target.id,
                formation_key=formation_value,
                title=title_value,
                kickoff_at=kickoff_at,
            )
            message = await interaction.followup.send(
                wizard._progress_text(),
                view=wizard,
                ephemeral=True,
                wait=True,
            )
            wizard.message = message

        @self.tree.command(name="attendance_wizard", description="Open step-by-step attendance wizard for create/vote/reschedule/close/remove")
        @app_commands.default_permissions(administrator=True)
        async def attendance_wizard(interaction: discord.Interaction):
            await interaction.response.defer(ephemeral=True)
            wizard = AttendanceWizardView(bot=self, owner_id=interaction.user.id)
            message = await interaction.followup.send(
                wizard._text(),
                view=wizard,
                ephemeral=True,
                wait=True,
            )
            wizard.message = message

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
