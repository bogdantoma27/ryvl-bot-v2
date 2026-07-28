import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.attendance import router as attendance_router
from app.api.bootstrap import router as bootstrap_router
from app.api.docs import router as docs_router
from app.api.diagnostics import router as diagnostics_router
from app.api.health import router as health_router
from app.api.lineup import router as lineup_router
from app.api.settings import router as settings_router
from app.auth import router as auth_router
from app.config import get_settings
from app.db import Base, engine
from app.discord_bot import start_bot, stop_bot
from app.scheduler import AttendanceScheduler

logging.basicConfig(level=logging.INFO)
settings = get_settings()
scheduler = AttendanceScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    app.state.started_at = datetime.now(timezone.utc)
    app.state.scheduler = scheduler
    scheduler.start()
    bot = await start_bot(settings)
    app.state.discord_bot = bot
    try:
        yield
    finally:
        await scheduler.stop()
        await stop_bot(bot)


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.admin_app_url, "http://localhost:4200", "http://127.0.0.1:4200"],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(docs_router)
app.include_router(auth_router)
app.include_router(bootstrap_router)
app.include_router(settings_router)
app.include_router(diagnostics_router)
app.include_router(attendance_router)
app.include_router(lineup_router)
