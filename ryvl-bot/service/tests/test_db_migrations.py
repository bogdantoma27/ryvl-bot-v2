from sqlalchemy import create_engine, text

from app.db_migrations import run_startup_migrations


def test_vpg_migrations_run_without_event_tables():
    engine = create_engine("sqlite:///:memory:", future=True)
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE vpg_schedules (id INTEGER PRIMARY KEY, league_slug VARCHAR(160) NOT NULL)"))

    run_startup_migrations(engine)

    columns = {column["name"] for column in engine.dialect.get_columns(engine.connect(), "vpg_schedules")}
    assert {"league_name", "last_run_key", "last_error", "updated_at"}.issubset(columns)