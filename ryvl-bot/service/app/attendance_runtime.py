from __future__ import annotations

from asyncio import Lock


_revision = 0
_lock = Lock()


async def bump_attendance_revision() -> int:
    global _revision
    async with _lock:
        _revision += 1
        return _revision


def get_attendance_revision() -> int:
    return _revision