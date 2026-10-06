// The one place the bot names its home league and VPG community. Per-guild settings
// (VpgTransferConfig.communitySlug, TotwConfig.leagueSlug) override these; everything
// else defaults to them.

/** VPG league slug of Superliga România, the only league Superliga Awards (MVP) tracks. */
export const SUPERLIGA_LEAGUE_SLUG = 'Superliga-Romania';
/** Display name of Superliga România. */
export const SUPERLIGA_NAME = 'Superliga România';
/** VPG community the Superliga belongs to (VPG Romania, PS5). */
export const COMMUNITY_SLUG = 'VPGRoPS5';
/** Display name of the VPG Romania community. */
export const COMMUNITY_NAME = 'VPG Romania';
/** Time zone VPG Romania fixtures and scheduled posts follow unless a guild sets its own. */
export const LEAGUE_TIMEZONE = 'Europe/Bucharest';
/** Default Team of the Week schedule: Saturdays at 20:00 in the league time zone. */
export const DEFAULT_TOTW_CRON = '0 20 * * 6';

/** A readable name for a league slug, e.g. "Liga-2-Romania" -> "Liga 2 Romania". */
export function leagueDisplayName(slug: string): string {
  return slug === SUPERLIGA_LEAGUE_SLUG ? SUPERLIGA_NAME : String(slug || '').replace(/-/g, ' ');
}
