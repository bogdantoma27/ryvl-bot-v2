-- Reviewed additive upgrade for Superliga MVP stat tracking.
-- Creates four new tables only. Deliberately no DROP, TRUNCATE, DELETE, or changes to existing tables.
BEGIN;
SELECT pg_advisory_xact_lock(739201631);

CREATE TABLE IF NOT EXISTS "superliga_mvp_teams" (
    "id" TEXT NOT NULL,
    "league_slug" TEXT NOT NULL,
    "vpg_team_id" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo_url" TEXT,
    "ea_club_id" TEXT,
    "ea_club_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "superliga_mvp_teams_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "superliga_mvp_teams_league_slug_vpg_team_id_key" ON "superliga_mvp_teams"("league_slug", "vpg_team_id");

CREATE TABLE IF NOT EXISTS "superliga_mvp_matches" (
    "id" TEXT NOT NULL,
    "vpg_match_id" INTEGER NOT NULL,
    "league_slug" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "match_day" INTEGER,
    "kickoff_at" TIMESTAMP(3) NOT NULL,
    "original_kickoff_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "home_vpg_team_id" INTEGER,
    "away_vpg_team_id" INTEGER,
    "home_team_name" TEXT NOT NULL,
    "away_team_name" TEXT NOT NULL,
    "home_score" INTEGER,
    "away_score" INTEGER,
    "home_ea_club_id" TEXT,
    "away_ea_club_id" TEXT,
    "ea_match_id" TEXT,
    "ea_played_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "last_attempt_at" TIMESTAMP(3),
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "superliga_mvp_matches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "superliga_mvp_matches_vpg_match_id_key" ON "superliga_mvp_matches"("vpg_match_id");
CREATE INDEX IF NOT EXISTS "superliga_mvp_matches_league_slug_season_status_idx" ON "superliga_mvp_matches"("league_slug", "season", "status");

CREATE TABLE IF NOT EXISTS "superliga_mvp_player_stats" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "vpg_match_id" INTEGER NOT NULL,
    "league_slug" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "ea_match_id" TEXT NOT NULL,
    "ea_club_id" TEXT NOT NULL,
    "team_name" TEXT NOT NULL,
    "player_pro_id" TEXT NOT NULL,
    "player_name" TEXT NOT NULL,
    "pos" TEXT,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "shots" INTEGER NOT NULL DEFAULT 0,
    "passes_made" INTEGER NOT NULL DEFAULT 0,
    "pass_attempts" INTEGER NOT NULL DEFAULT 0,
    "tackles_made" INTEGER NOT NULL DEFAULT 0,
    "tackle_attempts" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "goals_conceded" INTEGER NOT NULL DEFAULT 0,
    "clean_sheet_def" INTEGER NOT NULL DEFAULT 0,
    "clean_sheet_gk" INTEGER NOT NULL DEFAULT 0,
    "mom" INTEGER NOT NULL DEFAULT 0,
    "red_cards" INTEGER NOT NULL DEFAULT 0,
    "seconds_played" INTEGER NOT NULL DEFAULT 0,
    "raw" JSONB NOT NULL,
    "played_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "superliga_mvp_player_stats_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "superliga_mvp_player_stats_league_slug_season_idx" ON "superliga_mvp_player_stats"("league_slug", "season");
CREATE UNIQUE INDEX IF NOT EXISTS "superliga_mvp_player_stats_vpg_match_id_ea_club_id_player_p_key" ON "superliga_mvp_player_stats"("vpg_match_id", "ea_club_id", "player_pro_id");

CREATE TABLE IF NOT EXISTS "superliga_mvp_totw_selections" (
    "id" TEXT NOT NULL,
    "league_slug" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "vpg_username" TEXT NOT NULL,
    "ea_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "position" TEXT NOT NULL,
    "team_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "superliga_mvp_totw_selections_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "superliga_mvp_totw_selections_league_slug_season_idx" ON "superliga_mvp_totw_selections"("league_slug", "season");
CREATE UNIQUE INDEX IF NOT EXISTS "superliga_mvp_totw_selections_league_slug_season_week_vpg_u_key" ON "superliga_mvp_totw_selections"("league_slug", "season", "week", "vpg_username");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'superliga_mvp_player_stats_match_id_fkey') THEN
    ALTER TABLE "superliga_mvp_player_stats" ADD CONSTRAINT "superliga_mvp_player_stats_match_id_fkey"
      FOREIGN KEY ("match_id") REFERENCES "superliga_mvp_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
