/** One source for community links, shared by all public pages. */
export const SOCIAL_LINKS = {
  discord: 'https://discord.gg/nEvvHvqZQX',
  twitch: 'https://twitch.tv/ryvlesports',
  youtube: 'https://www.youtube.com/@ryvlesports',
} as const;
export function isRyvlName(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
  return name === 'ryvl' || name === 'ryvl esports';
}
export function romanianMatchDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date to be confirmed';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bucharest', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
}
