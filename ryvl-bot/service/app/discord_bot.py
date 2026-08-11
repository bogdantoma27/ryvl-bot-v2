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

from app.event_service import cancel_event_by_message_id, close_event, create_series, mark_event_open_with_message, remove_vote, reschedule_event, set_vote
from app.config import Settings
from app.db import SessionLocal
from app.lineup_formations import FORMATIONS
from app.lineup_renderer import render_lineup_png
from app.models import EventSeries, PostTimingMode, RecurrenceEndsMode, VoteStatus
from app.schemas import EventCreateRequest, EventRescheduleRequest, EventVoteRequest
from app.time_utils import format_dual_kickoff_lines

logger = logging.getLogger(__name__)
EVENT_VOTE_BUTTON_PREFIX = "attendance_vote:"


def _validate_post_timing(mode: str, value: str | None) -> None:
    normalized = str(value or "").strip()
    if mode in {PostTimingMode.BEFORE_EVENT_START.value, PostTimingMode.AFTER_PREVIOUS_EVENT_ENDS.value}:
        if normalized and (not normalized.isdigit() or not 0 <= int(normalized) <= 10080):
            raise ValueError("post_timing_value must be minutes from 0 to 10080")
    if mode == PostTimingMode.AT_SPECIFIC_TIME.value and normalized:
        parts = normalized.split(",", 1)
        if len(parts) != 2:
            raise ValueError("at_specific_time must use weekday,HH:mm")
        _parse_weekdays(parts[0], 0)
        if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", parts[1].strip()):
            raise ValueError("at_specific_time must use weekday,HH:mm")


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
        kickoff_iso = ""
        kickoff_lines: list[str] = []
        if self.kickoff_at is not None:
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

        message = await channel.send(
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


def _event_closed(event: dict) -> bool:
    status = str(event.get("status") or "").lower()
    return "closed" in status or "cancelled" in status


def _event_cancelled(event: dict) -> bool:
    status = str(event.get("status") or "").lower()
    return "cancelled" in status


def _names_for_status(event: dict, status: str) -> str:
    rows = [vote for vote in event.get("votes", []) if vote.get("status") == status]
    rows.sort(key=lambda vote: str(vote.get("updated_at") or ""))
    names = [str(vote.get("display_name") or "-") for vote in rows]
    if not names:
        return "-"
    return _truncate("\n".join(names))


def _event_embed(series: dict, event: dict) -> discord.Embed:
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
    if not _event_closed(event):
        description_parts.append("Click one button below to set or change your response.")

    if _event_closed(event):
        description_parts.append("")
        if _event_cancelled(event):
            description_parts.append("**Responses are cancelled.**")
        else:
            description_parts.append("**Responses are closed.**")

    embed = discord.Embed(
        title=str(series.get("title") or "Event"),
        description="\n".join(description_parts),
        color=0x6B7280 if _event_closed(event) else 0x2563EB,
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


def _event_buttons(event_id: int, *, disabled: bool) -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    view.add_item(discord.ui.Button(
        label="Accept",
        emoji="✅",
        style=discord.ButtonStyle.success,
        custom_id=f"{EVENT_VOTE_BUTTON_PREFIX}{event_id}:accepted",
        disabled=disabled,
    ))
    view.add_item(discord.ui.Button(
        label="Decline",
        emoji="❌",
        style=discord.ButtonStyle.danger,
        custom_id=f"{EVENT_VOTE_BUTTON_PREFIX}{event_id}:declined",
        disabled=disabled,
    ))
    view.add_item(discord.ui.Button(
        label="Tentative",
        emoji="🟡",
        style=discord.ButtonStyle.secondary,
        custom_id=f"{EVENT_VOTE_BUTTON_PREFIX}{event_id}:tentative",
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


def _event_message_content(series: dict, event: dict) -> str:
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


async def _sync_event_message(bot: commands.Bot, db, event: dict) -> None:
    series = db.get(EventSeries, int(event["series_id"]))
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
        embed=_event_embed({
            "title": series.title,
            "description": series.description,
            "created_by_discord_id": series.created_by_discord_id,
        }, event),
        view=_event_buttons(int(event["id"]), disabled=_event_closed(event)),
    )


async def _delete_event_message(bot: commands.Bot, db, event: dict) -> None:
    if not event.get("message_id"):
        return
    series = db.get(EventSeries, int(event["series_id"]))
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


def _parse_weekdays(value: str | None, fallback: int) -> list[int]:
    names = {"mon": 0, "monday": 0, "tue": 1, "tuesday": 1, "wed": 2, "wednesday": 2, "thu": 3, "thursday": 3, "fri": 4, "friday": 4, "sat": 5, "saturday": 5, "sun": 6, "sunday": 6}
    if not value or not value.strip():
        return [fallback]
    result: set[int] = set()
    for token in value.lower().replace(";", ",").split(","):
        token = token.strip()
        if not token:
            continue
        if token.isdigit() and 0 <= int(token) <= 6:
            result.add(int(token))
        elif token in names:
            result.add(names[token])
        else:
            raise ValueError("weekdays must be comma-separated names such as mon,tue,thu")
    if not result:
        raise ValueError("at least one weekday is required")
    return sorted(result)


class RyvlBot(commands.Bot):
    def __init__(self, settings: Settings):
        intents = discord.Intents.default()
        intents.guilds = True
        intents.members = True
        super().__init__(command_prefix="!", intents=intents)
        self.settings = settings

    async def setup_hook(self) -> None:
        class EventCreateModal(discord.ui.Modal, title="Event - Create Event"):
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
                label="Recurrence settings",
                placeholder="weekly mon,tue,thu|never||at_specific_time|sun,18:00",
                required=False,
                max_length=200,
            )

            def __init__(self):
                super().__init__(timeout=300)
                self.submitted = False

            async def on_submit(self, interaction: discord.Interaction) -> None:
                self.submitted = True
                await interaction.response.defer(ephemeral=True)
                self.stop()

        class EventVoteModal(discord.ui.Modal, title="Event - Set Vote"):
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

        class EventRescheduleModal(discord.ui.Modal, title="Event - Reschedule"):
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

        class EventCloseModal(discord.ui.Modal, title="Event - Close Event"):
            event_id_input = discord.ui.TextInput(label="Event ID", required=True, max_length=32)

            def __init__(self):
                super().__init__(timeout=300)
                self.submitted = False

            async def on_submit(self, interaction: discord.Interaction) -> None:
                self.submitted = True
                await interaction.response.defer(ephemeral=True)
                self.stop()

        class EventRemoveVoteModal(discord.ui.Modal, title="Event - Remove Vote"):
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

        class EventWizardView(discord.ui.View):
            def __init__(self, *, bot: "RyvlBot", owner_id: int):
                super().__init__(timeout=900)
                self.bot = bot
                self.owner_id = owner_id
                self.message: discord.Message | None = None

            def _is_owner(self, interaction: discord.Interaction) -> bool:
                return interaction.user.id == self.owner_id

            def _text(self) -> str:
                return (
                    "**Event Wizard**\n"
                    "Choose an action below.\n"
                    "- Create: new event\n"
                    "- Vote: set your response\n"
                    "- Reschedule: move an event\n"
                    "- Close: close responses\n"
                    "- Remove Vote: remove a user vote\n\n"
                    "**Create format help (Recurrence field):**\n"
                    "`none`\n"
                    "`weekly mon,tue,thu|never||at_event_start`\n"
                    "`weekly mon,tue,thu|after_count|6|before_event_start|60`\n"
                    "`weekly mon,tue,thu|never||at_specific_time|sun,18:00`\n"
                    "(fields: weekdays|ends mode|ends value|post mode|post value)"
                )

            async def _send_owner_only(self, interaction: discord.Interaction) -> bool:
                if self._is_owner(interaction):
                    return True
                await interaction.response.send_message("Only the command author can use this event wizard.", ephemeral=True)
                return False

            async def _resolve_channel(self, interaction: discord.Interaction) -> TextChannel | None:
                if isinstance(interaction.channel, TextChannel):
                    return interaction.channel
                return None

            @discord.ui.button(label="Create", style=discord.ButtonStyle.success)
            async def create_action(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
                if not await self._send_owner_only(interaction):
                    return
                modal = EventCreateModal()
                await interaction.response.send_modal(modal)
                timed_out = await modal.wait()
                if timed_out or not modal.submitted:
                    return

                channel_target = await self._resolve_channel(interaction)
                if channel_target is None:
                    await interaction.followup.send("No target channel found. Configure a default event channel.", ephemeral=True)
                    return

                title = str(modal.title_input.value or "").strip()
                date_raw = str(modal.date_input.value or "").strip()
                time_raw = str(modal.time_input.value or "").strip()
                description = str(modal.description_input.value or "Respond with accept, tentative or decline.").strip() or "Respond with accept, tentative or decline."
                recurrence_raw = str(modal.recurrence_input.value or "none").strip().lower()
                recurrence = "none"
                repeat_count: int | None = None
                publish_time_raw = ""
                weekdays_raw: list[int] = []
                ends_mode_raw = RecurrenceEndsMode.NEVER.value
                end_value_raw: str | None = None
                post_timing_mode_raw = PostTimingMode.AT_EVENT_START.value
                post_timing_value_raw: str | None = None

                help_text = (
                    "Invalid recurrence format. Use one of:\n"
                    "- `none`\n"
                    "- `weekly 6`\n"
                    "- `weekly 6 18:00`\n"
                    "- `weekly 6 18:00`"
                )

                if "|" in recurrence_raw:
                    fields = [field.strip() for field in recurrence_raw.split("|")]
                    recurrence = fields[0] if fields and fields[0] in {"none", "weekly"} else "none"
                    if recurrence != "weekly" or len(fields) < 4 or len(fields) > 6:
                        await interaction.followup.send(help_text, ephemeral=True)
                        return
                    try:
                        weekdays_raw = _parse_weekdays(fields[1], 0)
                    except ValueError as error:
                        await interaction.followup.send(str(error), ephemeral=True)
                        return
                    ends_mode_raw = fields[2] or RecurrenceEndsMode.NEVER.value
                    end_value_raw = fields[3] or None
                    post_timing_mode_raw = fields[4] if len(fields) > 4 and fields[4] else PostTimingMode.AT_EVENT_START.value
                    post_timing_value_raw = fields[5] if len(fields) > 5 and fields[5] else None
                parts = recurrence_raw.split()
                if parts:
                    if "|" in recurrence_raw:
                        parts = []
                    recurrence = parts[0] if parts and parts[0] in {"none", "weekly"} else recurrence

                    if recurrence == "none" and len(parts) > 1:
                        await interaction.followup.send(help_text, ephemeral=True)
                        return

                    if recurrence == "weekly":
                        token_index = 1
                        if len(parts) > token_index and parts[token_index].isdigit():
                            repeat_count = int(parts[token_index])
                            token_index += 1

                        if len(parts) > token_index:
                            publish_token = parts[token_index].strip()
                            if len(parts) > token_index + 1:
                                await interaction.followup.send(help_text, ephemeral=True)
                                return

                            if "," in publish_token:
                                await interaction.followup.send("Per-occurrence publish time lists are no longer supported. Use the posting mode fields.", ephemeral=True)
                                return
                            publish_time_raw = publish_token

                if repeat_count is not None and repeat_count < 1:
                    await interaction.followup.send(help_text, ephemeral=True)
                    return

                try:
                    starts_at = _parse_datetime(date_raw, time_raw, self.bot.settings.default_timezone)
                except ValueError:
                    await interaction.followup.send("Invalid date/time. Use YYYY-MM-DD and HH:mm.", ephemeral=True)
                    return

                if end_value_raw and ends_mode_raw == RecurrenceEndsMode.AFTER_COUNT.value:
                    try:
                        repeat_count = int(end_value_raw)
                    except ValueError:
                        repeat_count = None
                try:
                    end_date = _parse_datetime(end_value_raw, "23:59", self.bot.settings.default_timezone) if end_value_raw and ends_mode_raw == RecurrenceEndsMode.ON_DATE.value else None
                except ValueError:
                    await interaction.followup.send("The recurrence end date must use YYYY-MM-DD.", ephemeral=True)
                    return

                if recurrence == "weekly" and repeat_count is not None and (repeat_count < 1 or repeat_count > 52):
                    await interaction.followup.send("repeat_count must be between 2 and 52 for weekly events.", ephemeral=True)
                    return

                try:
                    _validate_post_timing(post_timing_mode_raw, post_timing_value_raw)
                except ValueError as error:
                    await interaction.followup.send(str(error), ephemeral=True)
                    return

                if publish_time_raw and not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", publish_time_raw):
                    await interaction.followup.send("Publish time must use HH:mm.", ephemeral=True)
                    return

                with SessionLocal() as db:
                    payload = EventCreateRequest(
                        channel_id=str(channel_target.id),
                        title=title,
                        description=description,
                        timezone=self.bot.settings.default_timezone,
                        starts_at=starts_at,
                        publish_time=publish_time_raw or None,
                        recurrence=recurrence,
                        repeat_count=repeat_count if recurrence == "weekly" else None,
                        weekdays=weekdays_raw,
                        ends_mode=ends_mode_raw,
                        end_date=end_date,
                        post_timing_mode=post_timing_mode_raw,
                        post_timing_value=post_timing_value_raw,
                    )
                    series = create_series(
                        db,
                        payload,
                        guild_id=self.bot.settings.discord_guild_id,
                        created_by_discord_id=str(interaction.user.id),
                    )
                    first_events = [event for event in series.get("events", []) if event.get("batch_number") == 1]
                    if not first_events:
                        await interaction.followup.send("Could not create the first event occurrence.", ephemeral=True)
                        return
                    posted_count = await self.bot.post_due_first_batch_events(db, series, int(channel_target.id))
                    if posted_count:
                        await interaction.followup.send(
                            f"Event created with {posted_count} polls posted in <#{channel_target.id}>.",
                            ephemeral=True,
                        )
                    else:
                        await interaction.followup.send(
                            f"Event created with {len(first_events)} polls scheduled according to the posting rule.",
                            ephemeral=True,
                        )

            @discord.ui.button(label="Vote", style=discord.ButtonStyle.primary)
            async def vote_action(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
                if not await self._send_owner_only(interaction):
                    return
                modal = EventVoteModal()
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
                            EventVoteRequest(
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
                        await _sync_event_message(self.bot, db, event)
                    except Exception:
                        logger.exception("Failed to sync event message for event %s", event_raw)

                await interaction.followup.send(f"Vote set to **{vote_status.value}** for event `{event_raw}`.", ephemeral=True)

            @discord.ui.button(label="Reschedule", style=discord.ButtonStyle.primary)
            async def reschedule_action(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
                if not await self._send_owner_only(interaction):
                    return
                modal = EventRescheduleModal()
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
                            EventRescheduleRequest(
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
                        await _sync_event_message(self.bot, db, event)
                    except Exception:
                        logger.exception("Failed to sync event message for event %s", event_raw)

                await interaction.followup.send(
                    f"Event `{event_raw}` rescheduled to {date_raw} {time_raw} ({self.bot.settings.default_timezone}).",
                    ephemeral=True,
                )

            @discord.ui.button(label="Close", style=discord.ButtonStyle.secondary)
            async def close_action(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
                if not await self._send_owner_only(interaction):
                    return
                modal = EventCloseModal()
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
                        await _sync_event_message(self.bot, db, event)
                    except Exception:
                        logger.exception("Failed to sync event message for event %s", event_raw)

                await interaction.followup.send(f"Event `{event_raw}` closed.", ephemeral=True)

            @discord.ui.button(label="Remove Vote", style=discord.ButtonStyle.secondary)
            async def remove_vote_action(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
                if not await self._send_owner_only(interaction):
                    return
                modal = EventRemoveVoteModal()
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
                        await _sync_event_message(self.bot, db, event)
                    except Exception:
                        logger.exception("Failed to sync event message for event %s", event_raw)

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
                        await self.message.edit(content="Event wizard closed.", view=None)
                self.stop()

            async def on_timeout(self) -> None:
                if self.message is not None:
                    try:
                        await self.message.edit(content="Event wizard expired. Run /event_wizard again.", view=None)
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

        @self.tree.command(name="event_create", description="Create an event or recurring event")
        @app_commands.default_permissions(administrator=True)
        @app_commands.describe(
            title="Public title shown in Discord for this event",
            date="Kickoff date in YYYY-MM-DD format",
            time="Kickoff time in HH:mm format (24h)",
            weekdays="For weekly events: comma-separated weekdays, for example mon,tue,thu",
            channel="Target Discord text channel (optional if a default event channel is configured)",
            description="Optional details shown under the event title",
            recurrence="Choose one time or weekly recurrence",
            ends_mode="When a weekly recurrence should stop",
            ends_value="Weeks count or YYYY-MM-DD, depending on ends_mode",
            post_timing_mode="When polls should be posted",
            post_timing_value="Minutes for offset modes, or weekday,HH:mm for a fixed time",
        )
        @app_commands.choices(
            recurrence=[
                app_commands.Choice(name="One time", value="none"),
                app_commands.Choice(name="Weekly", value="weekly"),
            ],
            ends_mode=[
                app_commands.Choice(name="Never", value="never"),
                app_commands.Choice(name="After a number of weeks", value="after_count"),
                app_commands.Choice(name="On a date", value="on_date"),
            ],
            post_timing_mode=[
                app_commands.Choice(name="When the event starts", value="at_event_start"),
                app_commands.Choice(name="Before the event starts", value="before_event_start"),
                app_commands.Choice(name="When the previous event ends", value="when_previous_event_ends"),
                app_commands.Choice(name="After the previous event ends", value="after_previous_event_ends"),
                app_commands.Choice(name="At a specific time", value="at_specific_time"),
            ],
        )
        async def event_create(
            interaction: discord.Interaction,
            title: str,
            date: str,
            time: str,
            weekdays: Optional[str] = None,
            channel: Optional[TextChannel] = None,
            description: str = "Respond with accept, tentative or decline.",
            recurrence: str = "none",
            ends_mode: str = "never",
            ends_value: Optional[str] = None,
            post_timing_mode: str = "at_event_start",
            post_timing_value: Optional[str] = None,
        ):
            await interaction.response.defer(ephemeral=True)
            channel_target = channel
            if channel_target is None:
                await interaction.followup.send("No channel provided. Specify a channel for this event.", ephemeral=True)
                return

            try:
                starts_at = _parse_datetime(date, time, self.settings.default_timezone)
            except ValueError:
                await interaction.followup.send("Invalid date/time. Use date YYYY-MM-DD and time HH:mm.", ephemeral=True)
                return

            try:
                weekday_values = _parse_weekdays(weekdays, starts_at.astimezone(ZoneInfo(self.settings.default_timezone)).weekday()) if recurrence == "weekly" else []
                repeat_count = int(ends_value) if recurrence == "weekly" and ends_mode == RecurrenceEndsMode.AFTER_COUNT.value and ends_value else None
                end_date = _parse_datetime(ends_value, "23:59", self.settings.default_timezone) if recurrence == "weekly" and ends_mode == RecurrenceEndsMode.ON_DATE.value and ends_value else None
                if ends_mode == RecurrenceEndsMode.AFTER_COUNT.value and (repeat_count is None or repeat_count < 1 or repeat_count > 52):
                    raise ValueError("ends_value must be a number of weeks between 1 and 52")
                if ends_mode == RecurrenceEndsMode.ON_DATE.value and end_date is None:
                    raise ValueError("ends_value must use YYYY-MM-DD for an on-date recurrence")
                _validate_post_timing(post_timing_mode, post_timing_value)
            except ValueError as error:
                await interaction.followup.send(str(error), ephemeral=True)
                return

            with SessionLocal() as db:
                payload = EventCreateRequest(
                    channel_id=str(channel_target.id),
                    title=title,
                    description=description,
                    timezone=self.settings.default_timezone,
                    starts_at=starts_at,
                    post_timing_mode=post_timing_mode,
                    post_timing_value=str(post_timing_value or "").strip() or None,
                    recurrence=recurrence,
                    repeat_count=repeat_count if recurrence == "weekly" else None,
                    weekdays=weekday_values,
                    ends_mode=ends_mode,
                    end_date=end_date,
                )
                series = create_series(
                    db,
                    payload,
                    guild_id=self.settings.discord_guild_id,
                    created_by_discord_id=str(interaction.user.id),
                )
                first_events = [event for event in series.get("events", []) if event.get("batch_number") == 1]
                if not first_events:
                    await interaction.followup.send("Could not create first event occurrence.", ephemeral=True)
                    return
                posted_count = await self.post_due_first_batch_events(db, series, int(channel_target.id))
                if posted_count:
                    await interaction.followup.send(
                        f"Event created with {posted_count} polls posted in <#{channel_target.id}>.",
                        ephemeral=True,
                    )
                else:
                    await interaction.followup.send(
                        f"Event created with {len(first_events)} polls scheduled according to the posting rule.",
                        ephemeral=True,
                    )

        @self.tree.command(name="event_vote", description="Set your event response")
        @app_commands.describe(
            event_id="Event ID visible in the event message footer",
            status="Your response for the selected event",
        )
        @app_commands.choices(
            status=[
                app_commands.Choice(name="Accepted", value="accepted"),
                app_commands.Choice(name="Tentative", value="tentative"),
                app_commands.Choice(name="Declined", value="declined"),
            ]
        )
        async def event_vote(
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
                        EventVoteRequest(
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
                    await _sync_event_message(self, db, event)
                except Exception:
                    logger.exception("Failed to sync event message for event %s", event_id)

            await interaction.followup.send(f"Vote set to **{vote_status.value}** for event `{event_id}`.", ephemeral=True)

        @self.tree.command(name="event_reschedule", description="Reschedule an event")
        @app_commands.default_permissions(administrator=True)
        @app_commands.describe(
            event_id="Event ID to reschedule",
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
        async def event_reschedule(
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
                        EventRescheduleRequest(
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
                    await _sync_event_message(self, db, event)
                except Exception:
                    logger.exception("Failed to sync event message for event %s", event_id)

            await interaction.followup.send(
                f"Event `{event_id}` rescheduled to {date} {time} ({self.settings.default_timezone}).",
                ephemeral=True,
            )

        @self.tree.command(name="event_close", description="Close an event")
        @app_commands.default_permissions(administrator=True)
        @app_commands.describe(event_id="Event ID to close")
        async def event_close(interaction: discord.Interaction, event_id: int):
            await interaction.response.defer(ephemeral=True)
            with SessionLocal() as db:
                try:
                    event = close_event(db, event_id)
                except LookupError:
                    await interaction.followup.send("Event not found.", ephemeral=True)
                    return

                try:
                    await _sync_event_message(self, db, event)
                except Exception:
                    logger.exception("Failed to sync event message for event %s", event_id)

            await interaction.followup.send(f"Event `{event_id}` closed.", ephemeral=True)

        @self.tree.command(name="event_remove_vote", description="Remove a user's event response")
        @app_commands.default_permissions(administrator=True)
        @app_commands.describe(
            event_id="Event ID from which to remove a vote",
            user="Server member whose vote will be removed",
        )
        async def event_remove_vote(
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
                    await _sync_event_message(self, db, event)
                except Exception:
                    logger.exception("Failed to sync event message for event %s", event_id)

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
            if channel_target is None:
                await interaction.response.send_message("No channel provided. Specify a channel for this lineup.", ephemeral=True)
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

        @self.tree.command(name="event_wizard", description="Open the event management wizard")
        @app_commands.default_permissions(administrator=True)
        async def event_wizard(interaction: discord.Interaction):
            await interaction.response.defer(ephemeral=True)
            wizard = EventWizardView(bot=self, owner_id=interaction.user.id)
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
            if custom_id.startswith(EVENT_VOTE_BUTTON_PREFIX):
                await self._handle_event_vote_button(interaction, custom_id)
                return

    async def _handle_event_vote_button(self, interaction: discord.Interaction, custom_id: str) -> None:
        raw = custom_id[len(EVENT_VOTE_BUTTON_PREFIX):]
        event_id_raw, _, status_raw = raw.partition(":")
        if not event_id_raw.isdigit() or status_raw not in {"accepted", "declined", "tentative"}:
            await interaction.response.send_message("Invalid event button payload.", ephemeral=True)
            return

        await interaction.response.defer()
        with SessionLocal() as db:
            try:
                event = set_vote(
                    db,
                    int(event_id_raw),
                    EventVoteRequest(
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
                await _sync_event_message(self, db, event)
            except Exception:
                logger.exception("Failed to sync event message for event %s", event_id_raw)

    async def post_event_message(
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
            embed=_event_embed(series, event),
            view=_event_buttons(int(event["id"]), disabled=_event_closed(event)),
            allowed_mentions=allowed_mentions,
        )

    async def post_due_first_batch_events(self, db, series: dict, channel_id: int) -> int:
        events = [event for event in series.get("events", []) if event.get("batch_number") == 1]
        if not events or not all(event.get("publish_at") and event["publish_at"] <= datetime.now(timezone.utc) for event in events):
            return 0
        for event in events:
            message = await self.post_event_message(channel_id=channel_id, series=series, event=event)
            mark_event_open_with_message(db, int(event["id"]), str(message.id))
        return len(events)

    async def sync_event(self, db, event: dict) -> None:
        await _sync_event_message(self, db, event)

    async def delete_event_message(self, db, event: dict) -> None:
        await _delete_event_message(self, db, event)

    async def on_raw_message_delete(self, payload: discord.RawMessageDeleteEvent) -> None:
        with SessionLocal() as db:
            cancelled = cancel_event_by_message_id(db, str(payload.message_id))
            if cancelled:
                logger.info("Event %s cancelled because Discord message %s was deleted", cancelled["id"], payload.message_id)


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
