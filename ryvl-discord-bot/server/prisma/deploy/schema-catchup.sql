-- Brings databases created from older schemas up to schema.prisma: columns and tables
-- that were added with `prisma db push` but never had a reviewed upgrade file.
-- Additive and idempotent only.
BEGIN;
SELECT pg_advisory_xact_lock(739201630);

ALTER TABLE "ea_player_match_stats"
  ADD COLUMN IF NOT EXISTS "clean_sheets_any" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "dribbles" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "fouls" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "goals_conceded" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "match_event_aggregate_0" TEXT,
  ADD COLUMN IF NOT EXISTS "match_event_aggregate_1" TEXT,
  ADD COLUMN IF NOT EXISTS "match_event_aggregate_2" TEXT,
  ADD COLUMN IF NOT EXISTS "match_event_aggregate_3" TEXT,
  ADD COLUMN IF NOT EXISTS "seconds_played" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "yellow_cards" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "tournament_instances"
  ADD COLUMN IF NOT EXISTS "discord_category_id" TEXT,
  ADD COLUMN IF NOT EXISTS "discord_channels" JSONB,
  ADD COLUMN IF NOT EXISTS "draft_state" JSONB,
  ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "tournament_instances" ALTER COLUMN "formation" SET DEFAULT '3-1-4-2';
ALTER TABLE "totw_configs" ALTER COLUMN "formation" SET DEFAULT '3-5-2';

-- Prisma sets @updatedAt itself; the database default only differs from the schema.
ALTER TABLE "registered_discord_players" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "superliga_mvp_matches" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "superliga_mvp_teams" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "totw_configs" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "tournament_configs" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "tournament_instances" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "vpg_notification_configs" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "vpg_notification_deliveries" ALTER COLUMN "updated_at" DROP DEFAULT;

CREATE TABLE IF NOT EXISTS "tracked_clubs" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "club_name" TEXT NOT NULL,
    "channel_id" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'common-gen5',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_match_id" TEXT,
    "last_polled_at" TIMESTAMP(3),
    "crest_url" TEXT,
    "elo" INTEGER NOT NULL DEFAULT 1200,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tracked_clubs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tracked_clubs_guild_id_club_id_key" ON "tracked_clubs"("guild_id", "club_id");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tracked_clubs_guild_id_fkey') THEN
    ALTER TABLE "tracked_clubs" ADD CONSTRAINT "tracked_clubs_guild_id_fkey"
      FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
