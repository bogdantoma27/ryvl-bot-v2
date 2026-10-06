-- Reviewed additive upgrade: website form storage and safer tracker defaults.
-- Deliberately no DROP, TRUNCATE, DELETE, or changes to existing rows.
BEGIN;
SELECT pg_advisory_xact_lock(739201630);
CREATE TABLE IF NOT EXISTS "website_submissions" (
  "id" TEXT PRIMARY KEY,
  "guild_id" TEXT NOT NULL REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "delivered_message_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "website_submissions_guild_id_created_at_idx"
  ON "website_submissions"("guild_id", "created_at");
-- New EA trackers and TOTW schedules start disabled; existing rows keep their value.
ALTER TABLE "club_tracker_configs" ALTER COLUMN "enabled" SET DEFAULT false;
ALTER TABLE "totw_configs" ALTER COLUMN "enabled" SET DEFAULT false;
COMMIT;
