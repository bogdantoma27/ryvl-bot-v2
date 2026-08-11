from sqlalchemy import inspect, text


_SERIES_COLUMNS = {
    "anchor_starts_at": "TIMESTAMP NULL",
    "weekdays": "VARCHAR(32) NOT NULL DEFAULT '0'",
    "ends_mode": "VARCHAR(32) NOT NULL DEFAULT 'never'",
    "end_date": "TIMESTAMP NULL",
    "post_timing_mode": "VARCHAR(40) NOT NULL DEFAULT 'at_event_start'",
    "post_timing_value": "VARCHAR(64) NULL",
    "status": "VARCHAR(24) NOT NULL DEFAULT 'active'",
    "mention_role_ids": "TEXT NOT NULL DEFAULT '[]'",
}

_EVENT_COLUMNS = {
    "batch_number": "INTEGER NOT NULL DEFAULT 1",
    "weekday": "INTEGER NULL",
}

_VPG_COLUMNS = {
    "vpg_schedules": {
        "league_name": "VARCHAR(160) NOT NULL DEFAULT ''",
        "last_run_key": "VARCHAR(32) NULL",
        "last_run_at": "TIMESTAMP NULL",
        "last_error": "TEXT NULL",
        "updated_at": "TIMESTAMP NULL",
    },
    "vpg_transfer_feeds": {
        "last_polled_at": "TIMESTAMP NULL",
        "last_error": "TEXT NULL",
        "updated_at": "TIMESTAMP NULL",
    },
    "vpg_transfer_records": {
        "occurred_at": "TIMESTAMP NULL",
        "posted_at": "TIMESTAMP NULL",
        "message_id": "VARCHAR(64) NULL",
    },
}

# Legacy "attendance_*" table names from before the attendance->event rename.
_TABLE_RENAMES = {
    "attendance_series": "event_series",
    "attendance_events": "event_occurrences",
    "attendance_votes": "event_votes",
}


def _rename_legacy_tables(engine) -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    with engine.begin() as connection:
        for old_name, new_name in _TABLE_RENAMES.items():
            if old_name in table_names and new_name not in table_names:
                connection.execute(text(f"ALTER TABLE {old_name} RENAME TO {new_name}"))


def _delete_orphan_series(engine) -> None:
    inspector = inspect(engine)
    if "event_series" not in inspector.get_table_names() or "event_occurrences" not in inspector.get_table_names():
        return
    with engine.begin() as connection:
        connection.execute(text(
            "DELETE FROM event_series WHERE id NOT IN (SELECT DISTINCT series_id FROM event_occurrences)"
        ))


def _migrate_vpg_tables(engine) -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    for table_name, columns in _VPG_COLUMNS.items():
        if table_name not in table_names:
            continue
        existing = {column["name"] for column in inspector.get_columns(table_name)}
        with engine.begin() as connection:
            for name, definition in columns.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {name} {definition}"))


def run_startup_migrations(engine) -> None:
    _rename_legacy_tables(engine)

    inspector = inspect(engine)
    if "event_series" in inspector.get_table_names():
        existing = {column["name"] for column in inspector.get_columns("event_series")}
        with engine.begin() as connection:
            for name, definition in _SERIES_COLUMNS.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE event_series ADD COLUMN {name} {definition}"))
            if "event_occurrences" in inspector.get_table_names():
                connection.execute(text(
                    "UPDATE event_series "
                    "SET anchor_starts_at = ("
                    "SELECT MIN(event_occurrences.closes_at) FROM event_occurrences "
                    "WHERE event_occurrences.series_id = event_series.id"
                    ") WHERE anchor_starts_at IS NULL"
                ))
            connection.execute(text("UPDATE event_series SET weekdays = '0' WHERE weekdays IS NULL OR weekdays = ''"))
            connection.execute(text("UPDATE event_series SET ends_mode = 'never' WHERE ends_mode IS NULL OR ends_mode = ''"))
            connection.execute(text("UPDATE event_series SET post_timing_mode = 'at_event_start' WHERE post_timing_mode IS NULL OR post_timing_mode = ''"))
            connection.execute(text("UPDATE event_series SET status = 'active' WHERE status IS NULL OR status = ''"))
            connection.execute(text("UPDATE event_series SET mention_role_ids = '[]' WHERE mention_role_ids IS NULL OR mention_role_ids = ''"))

    if "event_occurrences" in inspector.get_table_names():
        existing_events = {column["name"] for column in inspector.get_columns("event_occurrences")}
        with engine.begin() as connection:
            for name, definition in _EVENT_COLUMNS.items():
                if name not in existing_events:
                    connection.execute(text(f"ALTER TABLE event_occurrences ADD COLUMN {name} {definition}"))

        # Recurring series that never got an initial batch of events are dead weight.
        _delete_orphan_series(engine)

    _migrate_vpg_tables(engine)