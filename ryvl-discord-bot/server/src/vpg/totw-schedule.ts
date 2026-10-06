import { CronTime } from 'cron';
import { DEFAULT_TOTW_CRON, LEAGUE_TIMEZONE } from './league.constants';

// A scheduled Team of the Week missed by up to this long (a restart or a VPG outage
// around post time) is still posted; anything older waits for the next occurrence.
export const TOTW_CATCH_UP_MS = 2 * 60 * 60 * 1000;

/** Returns an error message for an invalid 5-field cron expression, or null when it is valid. */
export function cronScheduleError(expr: string): string | null {
  const value = String(expr ?? '').trim();
  if (value.split(/\s+/).length !== 5) return 'Use a 5-field cron expression: minute hour day-of-month month day-of-week';
  try {
    new CronTime(value, LEAGUE_TIMEZONE).sendAt();
    return null;
  } catch (err: any) {
    return `Invalid cron schedule: ${err?.message || err}`;
  }
}

/** A usable time zone: the one given when valid, otherwise the league's. */
export function scheduleTimeZone(timeZone?: string | null): string {
  if (timeZone) {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone }).format(0);
      return timeZone;
    } catch {
      /* fall through */
    }
  }
  return LEAGUE_TIMEZONE;
}

/**
 * The scheduled occurrence that should be posted now, or null. An occurrence is due
 * once its time has passed, it is after the last scheduled post, and it is at most
 * TOTW_CATCH_UP_MS old.
 */
export function dueTotwOccurrence(
  cronSchedule: string | null | undefined,
  timeZone: string | null | undefined,
  now: Date,
  lastPostedAt: Date | null | undefined,
  catchUpMs = TOTW_CATCH_UP_MS,
): Date | null {
  const expr = cronSchedule && cronSchedule.trim() ? cronSchedule.trim() : DEFAULT_TOTW_CRON;
  const zone = scheduleTimeZone(timeZone);
  const from = Math.max(lastPostedAt ? lastPostedAt.getTime() : 0, now.getTime() - catchUpMs);
  let next: Date;
  try {
    next = new CronTime(expr, zone).getNextDateFrom(new Date(from), zone).toJSDate();
  } catch {
    return null;
  }
  return next.getTime() <= now.getTime() ? next : null;
}
