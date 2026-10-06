export const EA_DEFAULT_CREST =
  'https://media.contentapi.ea.com/content/dam/ea/fc/common/global/tertiary-logo.svg';

/** Visual variant: the admin dashboard (slate/emerald) or the public site (black/yellow). */
export type EaTheme = 'admin' | 'public';

export function formatEaTimestamp(timestamp: unknown): string {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp as string);
    return d.toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Europe/Bucharest',
    });
  } catch {
    return String(timestamp);
  }
}
