-- Reviewed additive upgrade for the Team of the Week scheduler.
-- Adds totw_configs.last_posted_at and makes the cron_schedule default match the schedule
-- the bot has always used (Saturdays 20:00). Safe to run repeatedly; drops nothing.
BEGIN;
SELECT pg_advisory_xact_lock(739201630);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'totw_configs' AND column_name = 'last_posted_at'
  ) THEN
    ALTER TABLE "totw_configs" ADD COLUMN "last_posted_at" TIMESTAMP(3);
    -- Until now every TOTW was posted on the hard-coded Saturday 20:00 schedule, whatever
    -- cron_schedule held. Rows that only carry the old, never-used database default keep
    -- that schedule now that cron_schedule is honoured. Runs once, with the column add.
    UPDATE "totw_configs" SET "cron_schedule" = '0 20 * * 6'
    WHERE "cron_schedule" IS NULL OR "cron_schedule" = '0 18 * * 1';
  END IF;
END $$;

ALTER TABLE "totw_configs" ALTER COLUMN "cron_schedule" SET DEFAULT '0 20 * * 6';

COMMIT;
