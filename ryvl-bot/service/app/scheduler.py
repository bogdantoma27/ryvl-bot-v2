import asyncio
import logging
from datetime import datetime, timezone

from app.attendance_service import close_due_events, list_due_publication_events, mark_event_open_with_message
from app.db import SessionLocal

logger = logging.getLogger(__name__)

SCHEDULER_INTERVAL_SECONDS = 60


class AttendanceScheduler:
    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None
        self._last_tick_at: datetime | None = None
        self._last_error: str | None = None
        self._bot = None

    def bind_bot(self, bot) -> None:
        self._bot = bot

    async def _publish_due(self) -> list[int]:
        bot = self._bot
        if bot is None or not bot.is_ready() or not hasattr(bot, "post_attendance_message"):
            return []

        with SessionLocal() as db:
            due_rows = list_due_publication_events(db)

        published: list[int] = []
        for row in due_rows:
            series = row["series"]
            event = row["event"]
            try:
                message = await bot.post_attendance_message(
                    channel_id=int(series["channel_id"]),
                    series=series,
                    event=event,
                )
                with SessionLocal() as db:
                    mark_event_open_with_message(db, int(event["id"]), str(message.id))
                published.append(int(event["id"]))
            except Exception:
                logger.exception("Failed to publish scheduled attendance event %s", event.get("id"))
        return published

    async def _loop(self) -> None:
        while self._running:
            try:
                published = await self._publish_due()
                if published:
                    logger.info("Published scheduled attendance events: %s", published)
                with SessionLocal() as db:
                    closed = close_due_events(db)
                if closed:
                    logger.info("Closed attendance events: %s", closed)
                self._last_error = None
            except Exception:
                self._last_error = "Attendance scheduler tick failed"
                logger.exception("Attendance scheduler tick failed")
            self._last_tick_at = datetime.now(timezone.utc)
            await asyncio.sleep(SCHEDULER_INTERVAL_SECONDS)

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._running = False
        if self._task:
            await self._task
            self._task = None

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def last_tick_at(self) -> datetime | None:
        return self._last_tick_at

    @property
    def last_error(self) -> str | None:
        return self._last_error
