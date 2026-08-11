import asyncio
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import VpgContentType, VpgSchedule, VpgTransferFeed
from app.vpg.normalizers import VpgMovement
from app.vpg import service


class FakeMessage:
    def __init__(self, message_id: int):
        self.id = message_id


class FakeChannel:
    def __init__(self):
        self.messages = []

    async def send(self, **payload):
        self.messages.append(payload)
        return FakeMessage(len(self.messages))


class FakeBot:
    def __init__(self, channel):
        self.channel = channel

    def is_ready(self):
        return True

    def get_channel(self, channel_id):
        return self.channel


class FakeContentClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def get_league(self, slug):
        return {"name": "Test League"}

    async def latest_season(self, slug):
        return 1

    async def get_standings(self, slug, season):
        return []

    async def list_matches(self, slug, status, season):
        return []


class FakeTransferClient:
    movements = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def list_movements(self, community_slug, limit=20, offset=0):
        return list(self.movements)

    async def get_community(self, community_slug):
        return {"id": 10, "name": "Test Community"}

    async def get_user(self, username):
        return {"image_id": None}

    async def get_user_contracts(self, username):
        return []

    def cdn_url(self, image_id, variant="xlThumb"):
        return None


def make_session_factory():
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)


def test_schedule_post_is_idempotent(monkeypatch):
    sessions = make_session_factory()
    channel = FakeChannel()
    bot = FakeBot(channel)
    monkeypatch.setattr(service, "SessionLocal", sessions)
    monkeypatch.setattr(service, "VpgClient", FakeContentClient)
    service.run_due_schedules.bot = bot

    with sessions() as db:
        db.add(VpgSchedule(
            guild_id="guild",
            league_slug="league",
            league_name="Test League",
            content_type=VpgContentType.STANDINGS,
            channel_id="123",
            weekdays="1",
            post_time="10:00",
            timezone="Europe/Bucharest",
            enabled=True,
            created_by_discord_id="admin",
        ))
        db.commit()

    async def scenario():
        now = datetime(2026, 8, 11, 7, 0, tzinfo=timezone.utc)
        assert await service.run_due_schedules(now) == [1]
        assert await service.run_due_schedules(now) == []

    asyncio.run(scenario())
    assert len(channel.messages) == 1


def test_transfer_poll_baselines_then_deduplicates(monkeypatch):
    sessions = make_session_factory()
    channel = FakeChannel()
    bot = FakeBot(channel)
    monkeypatch.setattr(service, "SessionLocal", sessions)
    monkeypatch.setattr(service, "VpgClient", FakeTransferClient)
    movement = VpgMovement(
        id=2,
        datetime="2026-08-11T20:31:00Z",
        username="player",
        from_name=None,
        from_slug=None,
        from_logo=None,
        to_name="Test Club",
        to_slug="test-club",
        to_logo=None,
        amount=None,
    )
    newer_movement = VpgMovement(
        id=3,
        datetime="2026-08-11T21:31:00Z",
        username="player",
        from_name="Old Club",
        from_slug="old-club",
        from_logo=None,
        to_name="Test Club",
        to_slug="test-club",
        to_logo=None,
        amount=0,
    )

    with sessions() as db:
        feed = VpgTransferFeed(guild_id="guild", community_slug="community", channel_id="123")
        db.add(feed)
        db.commit()
        feed_id = feed.id

    async def scenario():
        FakeTransferClient.movements = [movement]
        feed = sessions().get(VpgTransferFeed, feed_id)
        assert await service.poll_transfer_feed(feed, bot) == 0
        assert len(channel.messages) == 0

        feed = sessions().get(VpgTransferFeed, feed_id)
        FakeTransferClient.movements = [movement, newer_movement]
        assert await service.poll_transfer_feed(feed, bot) == 1
        assert await service.poll_transfer_feed(feed, bot) == 0

    asyncio.run(scenario())
    assert len(channel.messages) == 1
