import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.events import router as events_router
from app.api.bootstrap import public_router as public_bootstrap_router
from app.api.bootstrap import router as bootstrap_router
from app.api.docs import router as docs_router
from app.api.health import router as health_router
from app.api.lineup import router as lineup_router
from app.api.vpg import router as vpg_router
from app.auth import router as auth_router
from app.config import get_settings
from app.db import Base, engine
from app.db_migrations import run_startup_migrations
from app.discord_bot import start_bot, stop_bot
from app.scheduler import EventScheduler
from app.vpg.scheduler import VpgScheduler

logging.basicConfig(level=logging.INFO)
settings = get_settings()
scheduler = EventScheduler()
vpg_scheduler = VpgScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_startup_migrations(engine)
    app.state.started_at = datetime.now(timezone.utc)
    app.state.scheduler = scheduler
    app.state.vpg_scheduler = vpg_scheduler
    bot = await start_bot(settings)
    scheduler.bind_bot(bot)
    scheduler.start()
    vpg_scheduler.bind_bot(bot)
    vpg_scheduler.start()
    app.state.discord_bot = bot
    try:
        yield
    finally:
        await scheduler.stop()
        await vpg_scheduler.stop()
        await stop_bot(bot)


app = FastAPI(
    title="RYVL Bot API",
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
app.include_router(public_bootstrap_router)
app.include_router(events_router)
app.include_router(lineup_router)
app.include_router(vpg_router)
