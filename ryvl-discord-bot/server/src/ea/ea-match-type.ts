import type { EaRawMatch } from './ea.types';

export type EaMatchType = 'leagueMatch' | 'friendlyMatch' | 'playoffMatch' | 'practiceMatch' | 'unknown';

/** Exact named categories only. Numeric club fields are not a safe default:
 * retain the category requested from EA instead of guessing a numeric enum.
 */
export function normalizeEaMatchType(value: unknown): EaMatchType {
  if (typeof value !== 'string') return 'unknown';
  switch (value.trim().toLowerCase().replace(/[\s_-]+/g, '')) {
    case 'league':
    case 'leaguematch': return 'leagueMatch';
    case 'friendly':
    case 'friendlymatch': return 'friendlyMatch';
    case 'playoff':
    case 'playoffs':
    case 'playoffmatch': return 'playoffMatch';
    case 'practice':
    case 'practicematch': return 'practiceMatch';
    default: return 'unknown';
  }
}

/** One label map serves both Discord and the website's API response. */
export function formatEaMatchType(value: unknown): string {
  switch (normalizeEaMatchType(value)) {
    case 'leagueMatch': return 'League Match';
    case 'friendlyMatch': return 'Friendly Match';
    case 'playoffMatch': return 'Playoff Match';
    case 'practiceMatch': return 'Practice Match';
    default: return 'Pro Clubs Match';
  }
}

export function resolveEaMatchType(raw: EaRawMatch, trackedClubId: string): EaMatchType {
  // Preserve an explicit named type, including practice within a broader feed.
  // Conflicting named values are not resolved by guessing which one is correct.
  const explicit = [...new Set([raw.matchType, raw.clubs?.[trackedClubId]?.matchType]
    .map(normalizeEaMatchType).filter(type => type !== 'unknown'))];
  if (explicit.length) return explicit.length === 1 ? explicit[0] : 'unknown';

  // This metadata is stamped by fetchMatchesRaw, not inferred from a club name,
  // score, numeric field or the order in which the endpoints were requested.
  const sources = Array.isArray(raw.sourceMatchTypes) ? raw.sourceMatchTypes : [];
  const categories = [...new Set(sources.map(normalizeEaMatchType))];
  return categories.length === 1 ? categories[0] : 'unknown';
}

/** Deduplicate by match ID without discarding category provenance. If EA returns
 * the same ID in several different feeds, the resolver can safely show unknown.
 */
export function mergeEaRawMatch(matches: Map<string, EaRawMatch>, incoming: EaRawMatch): void {
  const id = String(incoming.matchId);
  const previous = matches.get(id);
  const previousSources = Array.isArray(previous?.sourceMatchTypes) ? previous.sourceMatchTypes : [];
  const incomingSources = Array.isArray(incoming.sourceMatchTypes) ? incoming.sourceMatchTypes : [];
  const sourceMatchTypes = [...new Set([...previousSources, ...incomingSources])];
  matches.set(id, {
    ...previous,
    ...incoming,
    // Do not add empty metadata to older untagged payloads or callers.
    ...(sourceMatchTypes.length ? { sourceMatchTypes } : {}),
  });
}
