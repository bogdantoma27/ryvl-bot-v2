-- Reviewed additive upgrade for EA Pro Clubs tracking.
-- No table/column drops. The only DROP removes the old (guild_id, ea_match_id)
-- unique index (no data), replaced by (guild_id, club_id, ea_match_id) so a
-- match between two clubs tracked in the same guild is recorded for both.
BEGIN;
SELECT pg_advisory_xact_lock(739201630);

ALTER TABLE "club_tracker_configs" ADD COLUMN IF NOT EXISTS "elo" INTEGER NOT NULL DEFAULT 1200;

ALTER TABLE "processed_ea_matches" ADD COLUMN IF NOT EXISTS "post_pending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "processed_ea_matches" ADD COLUMN IF NOT EXISTS "post_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "processed_ea_matches" ADD COLUMN IF NOT EXISTS "post_error" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "processed_ea_matches_guild_id_club_id_ea_match_id_key"
  ON "processed_ea_matches"("guild_id", "club_id", "ea_match_id");
ALTER TABLE "processed_ea_matches" DROP CONSTRAINT IF EXISTS "processed_ea_matches_guild_id_ea_match_id_key";
DROP INDEX IF EXISTS "processed_ea_matches_guild_id_ea_match_id_key";

CREATE INDEX IF NOT EXISTS "player_registration_audits_guild_id_created_at_idx"
  ON "player_registration_audits"("guild_id", "created_at");

COMMIT;
