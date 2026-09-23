-- Reviewed additive upgrade for an existing Prisma db-push installation.
-- Deliberately no DROP, TRUNCATE, DELETE, or changes to existing tables.
BEGIN;
SELECT pg_advisory_xact_lock(739201629);
CREATE TABLE IF NOT EXISTS "vpg_notification_configs" (
  "guild_id" TEXT PRIMARY KEY REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "poll_interval_sec" INTEGER NOT NULL DEFAULT 120,
  "fixtures_time" TEXT NOT NULL DEFAULT '10:00',
  "results_enabled" BOOLEAN NOT NULL DEFAULT true,
  "ryvl_results_enabled" BOOLEAN NOT NULL DEFAULT true,
  "fixtures_enabled" BOOLEAN NOT NULL DEFAULT true,
  "ryvl_fixtures_enabled" BOOLEAN NOT NULL DEFAULT true,
  "standings_enabled" BOOLEAN NOT NULL DEFAULT true,
  "ryvl_standings_enabled" BOOLEAN NOT NULL DEFAULT true,
  "last_polled_at" TIMESTAMP(3), "last_fixtures_polled_at" TIMESTAMP(3),
  "last_success_at" TIMESTAMP(3), "last_error" TEXT, "retry_after" TIMESTAMP(3),
  "lease_token" TEXT, "lease_until" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "vpg_notification_deliveries" (
  "id" TEXT PRIMARY KEY,
  "guild_id" TEXT NOT NULL REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "channel_id" TEXT NOT NULL, "topic" TEXT NOT NULL, "item_key" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL, "discord_message_id" TEXT, "suppressed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "vpg_delivery_destination_key"
  ON "vpg_notification_deliveries"("guild_id", "channel_id", "topic", "item_key");
CREATE INDEX IF NOT EXISTS "vpg_notification_deliveries_guild_id_topic_idx"
  ON "vpg_notification_deliveries"("guild_id", "topic");
COMMIT;
