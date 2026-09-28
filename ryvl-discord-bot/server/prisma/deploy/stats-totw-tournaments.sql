-- Reviewed additive upgrade for player stats, registered players, TOTW and tournaments.
-- Deliberately no DROP, TRUNCATE, DELETE, or changes to existing tables.
BEGIN;
SELECT pg_advisory_xact_lock(739201630);

-- 1. ea_player_match_stats
CREATE TABLE IF NOT EXISTS "ea_player_match_stats" (
    "id" TEXT PRIMARY KEY,
    "ea_match_id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "player_pro_id" TEXT NOT NULL,
    "player_pro_name" TEXT NOT NULL,
    "pos" TEXT,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "shots" INTEGER NOT NULL DEFAULT 0,
    "passes_made" INTEGER NOT NULL DEFAULT 0,
    "pass_attempts" INTEGER NOT NULL DEFAULT 0,
    "tackles_made" INTEGER NOT NULL DEFAULT 0,
    "tackle_attempts" INTEGER NOT NULL DEFAULT 0,
    "interceptions" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "mom" INTEGER NOT NULL DEFAULT 0,
    "clean_sheet_def" INTEGER NOT NULL DEFAULT 0,
    "clean_sheet_gk" INTEGER NOT NULL DEFAULT 0,
    "red_cards" INTEGER NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ea_player_match_stats_ea_match_id_player_pro_name_club_id_key" ON "ea_player_match_stats"("ea_match_id", "player_pro_name", "club_id");
CREATE INDEX IF NOT EXISTS "ea_player_match_stats_player_pro_name_idx" ON "ea_player_match_stats"("player_pro_name");
CREATE INDEX IF NOT EXISTS "ea_player_match_stats_club_id_idx" ON "ea_player_match_stats"("club_id");

-- 2. registered_discord_players
CREATE TABLE IF NOT EXISTS "registered_discord_players" (
    "id" TEXT PRIMARY KEY,
    "guild_id" TEXT NOT NULL REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "discord_user_id" TEXT NOT NULL,
    "ea_player_name" TEXT NOT NULL,
    "preferred_pos" TEXT,
    "platform" TEXT DEFAULT 'common-gen5',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "registered_discord_players_guild_id_discord_user_id_key" ON "registered_discord_players"("guild_id", "discord_user_id");
CREATE INDEX IF NOT EXISTS "registered_discord_players_guild_id_ea_player_name_idx" ON "registered_discord_players"("guild_id", "ea_player_name");

-- 3. player_registration_audits
CREATE TABLE IF NOT EXISTS "player_registration_audits" (
    "id" TEXT PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "discord_user_id" TEXT NOT NULL,
    "ea_player_name" TEXT NOT NULL,
    "performed_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. totw_configs
CREATE TABLE IF NOT EXISTS "totw_configs" (
    "id" TEXT PRIMARY KEY,
    "guild_id" TEXT NOT NULL REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "channel_id" TEXT,
    "community_slug" TEXT NOT NULL DEFAULT 'VPGRoPS5',
    "league_slug" TEXT NOT NULL DEFAULT 'Superliga-Romania',
    "formation" TEXT NOT NULL DEFAULT '433',
    "cron_schedule" TEXT DEFAULT '0 18 * * 1',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "totw_configs_guild_id_league_slug_key" ON "totw_configs"("guild_id", "league_slug");

-- 5. tournament_configs
CREATE TABLE IF NOT EXISTS "tournament_configs" (
    "id" TEXT PRIMARY KEY,
    "guild_id" TEXT NOT NULL UNIQUE REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "admin_channel_id" TEXT,
    "signup_channel_id" TEXT,
    "tournament_category_id" TEXT,
    "results_channel_id" TEXT,
    "chat_channel_id" TEXT,
    "standings_channel_id" TEXT,
    "rosters_channel_id" TEXT,
    "admin_role_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "captain_role_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. tournament_instances
CREATE TABLE IF NOT EXISTS "tournament_instances" (
    "id" TEXT PRIMARY KEY,
    "guild_id" TEXT NOT NULL REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "formation" TEXT NOT NULL DEFAULT '3-4-1-2',
    "teams_data" JSONB NOT NULL DEFAULT '[]',
    "signups_data" JSONB NOT NULL DEFAULT '[]',
    "matches_data" JSONB NOT NULL DEFAULT '[]',
    "current_draft_round" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
