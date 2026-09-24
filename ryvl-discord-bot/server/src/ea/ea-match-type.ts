import type { EaRawMatch } from './ea.types';

export type EaMatchType = 'leagueMatch' | 'friendlyMatch' | 'playoffMatch' | 'practiceMatch' | 'unknown';

/** Match names are explicit values, not substrings. Numeric EA metadata is kept
 * untouched; the requested feed supplies its category without guessing codes.
 */
export function normalizeEaMatchType(value: unknown): EaMatchType {
  if (typeof value !== 'string') return 'unknown';
  const key = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  switch (key) {
    case 'league': case 'leaguematch': return 'leagueMatch';
    case 'friendly': case 'friendlymatch': return 'friendlyMatch';
    case 'playoff': case 'playoffs': case 'playoffmatch': return 'playoffMatch';
    case 'practice': case 'practicematch': return 'practiceMatch';
    default: return 'unknown';
  }
}

/** Shared by the Discord builder and the public/admin API response. */
export function formatEaMatchType(value: unknown): string {
  switch (normalizeEaMatchType(value)) {
    case 'leagueMatch': return 'League Match';
    case 'friendlyMatch': return 'Friendly Match';
    case 'playoffMatch': return 'Playoff Match';
    case 'practiceMatch': return 'Practice Match';
    default: return 'Pro Clubs Match';
  }
}

function namedResponseTypes(raw: EaRawMatch): EaMatchType[] {
  const values: unknown[] = [raw.matchType, ...Object.values(raw.clubs || {}).map(club => club?.matchType)];
  return [...new Set(values.map(normalizeEaMatchType).filter(type => type !== 'unknown'))];
}

/** Capture provenance at the EA boundary, before different feeds are combined.
 * Our metadata survives JSON storage; the original club fields are not rewritten.
 */
export function withEaMatchType(raw: EaRawMatch, requested: string): EaRawMatch {
  return {
    ...raw,
    sourceMatchTypes: [normalizeEaMatchType(requested)],
    responseMatchTypes: namedResponseTypes(raw),
  };
}

/** A duplicate match ID stays one match, but not at the cost of losing category
 * conflicts. Unknown/conflicting evidence must never silently become League.
 */
export function mergeEaMatch(existing: EaRawMatch | undefined, incoming: EaRawMatch): EaRawMatch {
  if (!existing) return incoming;
  return {
    ...incoming,
    sourceMatchTypes: [...new Set([...(existing.sourceMatchTypes || []), ...(incoming.sourceMatchTypes || [])])],
    responseMatchTypes: [...new Set([
      ...(existing.responseMatchTypes || namedResponseTypes(existing)),
      ...(incoming.responseMatchTypes || namedResponseTypes(incoming)),
    ])],
  };
}

export function resolveEaMatchType(raw: EaRawMatch): EaMatchType {
  const response = [...new Set((raw.responseMatchTypes || namedResponseTypes(raw))
    .map(normalizeEaMatchType).filter(type => type !== 'unknown'))];
  // Preserve an explicitly supplied subtype, e.g. practice, when a broader feed
  // contains it. Conflicting named response types remain unclassified.
  if (response.length) return response.length === 1 ? response[0] : 'unknown';
  const sources = [...new Set((raw.sourceMatchTypes || []).map(normalizeEaMatchType))];
  return sources.length === 1 ? sources[0] : 'unknown';
}
