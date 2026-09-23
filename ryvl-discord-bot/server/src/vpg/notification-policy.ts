/** Shared rules for RYVL identity and Romanian calendar-based notifications. */
export const ROMANIA_TIME_ZONE = 'Europe/Bucharest';
export const RYVL_ALIASES = new Set(['ryvl', 'ryvl esports']);
export function normalizeTeamName(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US')
    : '';
}
export function isRyvlTeam(value: unknown): boolean {
  // Deliberately not a substring/"rival" match: unrelated clubs must never enter this feed.
  return RYVL_ALIASES.has(normalizeTeamName(value));
}
export interface TeamIdentity { slug?: string | null; name?: string; }
export interface MatchIdentity { homeName: string; awayName: string; homeSlug?: string | null; awaySlug?: string | null; }
export function isRyvlSide(name: string, slug?: string | null, identity?: TeamIdentity): boolean {
  if (identity?.slug && slug) return slug.toLowerCase() === identity.slug.toLowerCase();
  return isRyvlTeam(name);
}
export function isRyvlMatch(match: MatchIdentity, identity?: TeamIdentity): boolean {
  return isRyvlSide(match.homeName, match.homeSlug, identity) || isRyvlSide(match.awayName, match.awaySlug, identity);
}
export function resolveRyvlIdentity(rows: { teamName: string; teamSlug?: string | null }[]): TeamIdentity {
  const row = rows.find(r => normalizeTeamName(r.teamName) === 'ryvl esports') || rows.find(r => isRyvlTeam(r.teamName));
  return { name: row?.teamName || 'RYVL Esports', slug: row?.teamSlug || null };
}
export function romaniaClock(value: Date | string): { date: string; minutes: number; sunday: boolean } {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid match date');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ROMANIA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (key: string) => parts.find(p => p.type === key)?.value || '';
  return { date: `${part('year')}-${part('month')}-${part('day')}`, minutes: Number(part('hour')) * 60 + Number(part('minute')), sunday: part('weekday') === 'Sun' };
}
export function fixturesOnDay<T extends { id: number; datetime: string }>(matches: T[], day: string): T[] {
  const unique = new Map<number, T>();
  for (const match of matches) {
    try { if (romaniaClock(match.datetime).date === day) unique.set(match.id, match); } catch { /* Ignore invalid API timestamps; never invent a date. */ }
  }
  return [...unique.values()].sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime) || a.id - b.id);
}
export function dailyTimeReached(now: Date, time: string): boolean {
  const [hour, minute] = time.split(':').map(Number);
  return romaniaClock(now).minutes >= hour * 60 + minute;
}
export function standingsDue(now: Date): boolean {
  const clock = romaniaClock(now);
  // Same-day catch-up after a restart is allowed, but not a duplicate Sunday post.
  return clock.sunday && clock.minutes >= 10 * 60;
}
export function intervalDue(last: Date | null | undefined, seconds: number, now: Date): boolean {
  return !last || now.getTime() - last.getTime() >= seconds * 1000;
}
export function validateNotificationSettings(value: unknown): Record<string, boolean | number | string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a settings object');
  const allowedBooleans = ['resultsEnabled', 'ryvlResultsEnabled', 'fixturesEnabled', 'ryvlFixturesEnabled', 'standingsEnabled', 'ryvlStandingsEnabled'];
  const output: Record<string, boolean | number | string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (allowedBooleans.includes(key)) {
      if (typeof entry !== 'boolean') throw new Error(`${key} must be a boolean`);
    } else if (key === 'pollIntervalSec') {
      if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 60 || entry > 3600) throw new Error('Polling interval must be between 60 and 3600 seconds');
    } else if (key === 'fixturesTime') {
      if (typeof entry !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(entry)) throw new Error('Fixture time must use HH:mm');
    } else {
      throw new Error(`Unknown notification setting: ${key}`);
    }
    output[key] = entry as boolean | number | string;
  }
  return output;
}
