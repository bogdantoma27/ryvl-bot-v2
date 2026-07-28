from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings

settings = get_settings()


def _normalize_database_url(database_url: str) -> str:
    if database_url.startswith("postgres://"):
        return "postgresql+psycopg://" + database_url[len("postgres://"):]
    if database_url.startswith("postgresql://") and "+" not in database_url.split("://", 1)[0]:
        return "postgresql+psycopg://" + database_url[len("postgresql://"):]
    return database_url


class Base(DeclarativeBase):
    pass


database_url = _normalize_database_url(settings.database_url)
connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
engine = create_engine(database_url, future=True, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
