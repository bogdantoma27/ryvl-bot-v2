import asyncio
import logging
from datetime import datetime, timezone

from app.vpg.service import poll_due_transfers, run_due_schedules

logger = logging.getLogger(__name__)


class VpgScheduler:
    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None
        self._bot = None
        self._last_tick_at: datetime | None = None
        self._last_error: str | None = None

    def bind_bot(self, bot) -> None:
        self._bot = bot
        run_due_schedules.bot = bot
        poll_due_transfers.bot = bot
        from app.vpg.service import poll_transfer_feed
        poll_transfer_feed.bot = bot

    async def _loop(self) -> None:
        while self._running:
            try:
                await run_due_schedules()
                await poll_due_transfers()
                self._last_error = None
            except Exception:
                self._last_error = "VPG scheduler tick failed"
                logger.exception("VPG scheduler tick failed")
            self._last_tick_at = datetime.now(timezone.utc)
            await asyncio.sleep(60)

    def start(self) -> None:
        if not self._running:
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