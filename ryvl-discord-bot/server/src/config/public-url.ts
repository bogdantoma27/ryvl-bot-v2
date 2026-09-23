/** All bot website links use the same validated public origin as Discord OAuth. */
export function buildClubWebUrl(frontendUrl: string, guildId: string): string {
  const url = new URL('/club', frontendUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('FRONTEND_URL must be HTTP or HTTPS');
  url.searchParams.set('guildId', guildId);
  return url.toString();
}
