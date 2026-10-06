-- Reviewed additive upgrade for events, scheduler and lineups.
-- Deliberately no DROP, TRUNCATE, DELETE, or changes to existing columns.
BEGIN;
SELECT pg_advisory_xact_lock(739201630);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "publish_lead_minutes" INTEGER NOT NULL DEFAULT 2880;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "vpg_match_id" INTEGER;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "events_guild_id_vpg_match_id_key" ON "events"("guild_id", "vpg_match_id");
CREATE INDEX IF NOT EXISTS "events_status_archived_at_idx" ON "events"("status", "archived_at");
ALTER TABLE "event_occurrences" ADD COLUMN IF NOT EXISTS "publish_claim_token" TEXT;
ALTER TABLE "event_occurrences" ADD COLUMN IF NOT EXISTS "publish_claimed_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "event_occurrences_status_starts_at_idx" ON "event_occurrences"("status", "starts_at");
ALTER TABLE "lineup_drafts" ADD COLUMN IF NOT EXISTS "occurrence_id" TEXT;
ALTER TABLE "lineup_drafts" ADD COLUMN IF NOT EXISTS "show_ea_names" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "lineup_drafts" ADD COLUMN IF NOT EXISTS "last_posted_message_id" TEXT;
ALTER TABLE "lineup_drafts" ADD COLUMN IF NOT EXISTS "last_posted_channel_id" TEXT;
ALTER TABLE "lineup_drafts" ADD COLUMN IF NOT EXISTS "last_posted_at" TIMESTAMP(3);
COMMIT;
