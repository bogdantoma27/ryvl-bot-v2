import asyncio
import logging
from datetime import datetime, timezone

from app.attendance_service import close_due_events
from app.db import SessionLocal

logger = logging.getLogger(__name__)

SCHEDULER_INTERVAL_SECONDS = 60


class AttendanceScheduler:
    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None
        self._last_tick_at: datetime | None = None
        self._last_error: str | None = None

    async def _loop(self) -> None:
        while self._running:
            try:
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
