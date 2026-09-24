from pathlib import Path

root = Path('ryvl-discord-bot')
def edit(relative, old, new, count=1):
    path = root / relative
    text = path.read_text()
    actual = text.count(old)
    if actual != count:
        raise RuntimeError(f'{relative}: expected {count} exact patch targets, found {actual}')
    path.write_text(text.replace(old, new))

def prepend(relative, text):
    path = root / relative
    path.write_text(text + path.read_text())

edit('server/src/ea/ea.types.ts', '  matchType: string;\n  result: string;', '  matchType?: string | number | null;\n  result: string;')
edit('server/src/ea/ea.types.ts', 'export interface EaRawMatch {\n  matchId: string;', 'export interface EaRawMatch {\n  // Fetch provenance is preserved in stored rawPayload for later re-parsing.\n  sourceMatchTypes?: string[];\n  matchType?: string | number | null;\n  matchId: string;')
edit('server/src/ea/ea.types.ts', 'export interface ParsedEaMatch {\n  matchId: string;\n  timestamp: Date;\n  matchType: string;', 'export interface ParsedEaMatch {\n  matchId: string;\n  timestamp: Date;\n  matchType: string;\n  matchTypeLabel?: string;')
prepend('server/src/ea/ea.service.ts', "import { resolveEaMatchType, formatEaMatchType } from './ea-match-type';\n")
edit('server/src/ea/ea.service.ts', "    return this.runBridge('matches', [platform, String(clubId), matchType, String(count)]);", """    const matches = await this.runBridge('matches', [platform, String(clubId), matchType, String(count)]);
    if (!Array.isArray(matches)) throw new Error('Invalid upstream match response');
    // Keep the endpoint category through merging, persistence and embed creation.
    // Copy each object so EA's original fields remain intact for diagnostics.
    return matches.filter((match): match is EaRawMatch => Boolean(match && typeof match === 'object' && match.matchId))
      .map(match => ({ ...match, sourceMatchTypes: [matchType] }));""")
edit('server/src/ea/ea.service.ts', '    const trackedAggregate = raw.aggregate?.[trackedClubId];', '    const matchType = resolveEaMatchType(raw, trackedClubId);\n    const trackedAggregate = raw.aggregate?.[trackedClubId];')
edit('server/src/ea/ea.service.ts', "      matchType: trackedClubData?.matchType ? String(trackedClubData.matchType) : 'League',", '      matchType,\n      matchTypeLabel: formatEaMatchType(matchType),')
prepend('server/src/ea/ea-poller.service.ts', "import { mergeEaRawMatch } from './ea-match-type';\n")
edit('server/src/ea/ea-poller.service.ts', 'rawMatchesMap.set(String(m.matchId), m);', 'mergeEaRawMatch(rawMatchesMap, m);', 2)
prepend('server/src/ea/ea.controller.ts', "import { mergeEaRawMatch } from './ea-match-type';\nimport { EaRawMatch } from './ea.types';\n")
edit('server/src/ea/ea.controller.ts', 'new Map<string, any>()', 'new Map<string, EaRawMatch>()')
edit('server/src/ea/ea.controller.ts', 'rawMatchesMap.set(String(m.matchId), m);', 'mergeEaRawMatch(rawMatchesMap, m);')
prepend('server/src/discord/embeds/ea-embed.builder.ts', "import { formatEaMatchType } from '../../ea/ea-match-type';\n")
edit('server/src/discord/embeds/ea-embed.builder.ts', """export function formatMatchType(matchType: string): string {
  const normalized = (matchType || '').toLowerCase();
  if (normalized.includes('friendly')) return 'Friendly Match';
  if (normalized.includes('playoff')) return 'Playoff Match';
  return 'League Match';
}""", """export function formatMatchType(matchType: unknown): string {
  return formatEaMatchType(matchType);
}""")
edit('web/src/app/features/public/club.component.ts', "{{ match.matchType === '1' || match.matchType === 1 ? 'League Match' : 'Pro Clubs Match' }}", "{{ match.matchTypeLabel || 'Pro Clubs Match' }}")
edit('web/src/app/features/ea-tracker/ea-tracker.component.ts', "{{ match.matchType || 'League Match' }}", "{{ match.matchTypeLabel || 'Pro Clubs Match' }}")
print('Applied scoped EA category propagation, neutral fallback and tracker labels.')
