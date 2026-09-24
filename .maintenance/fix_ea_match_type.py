from pathlib import Path

# Exact, bounded replacements; abort if main's inspected source has drifted.
def replace(path, before, after, count=1):
    file = Path(path)
    source = file.read_text()
    assert source.count(before) == count, f'Unexpected source at {path}: {before[:90]}'
    file.write_text(source.replace(before, after))

server = 'ryvl-discord-bot/server/src/'
replace(server + 'ea/ea.types.ts', 'export interface EaRawMatch {\n', '''export interface EaRawMatch {
  /** EA may supply a named or numeric type; never overwrite its original value. */
  matchType?: string | number | null;
  /** Application provenance retained when feed results are deduplicated/stored. */
  sourceMatchTypes?: string[];
  responseMatchTypes?: string[];
''')
replace(server + 'ea/ea.types.ts', '  matchType: string;\n  trackedClubId: string;', '  matchType: string;\n  matchTypeLabel: string;\n  trackedClubId: string;')
replace(server + 'ea/ea.service.ts', "import { Injectable, Logger } from '@nestjs/common';", "import { withEaMatchType, resolveEaMatchType, formatEaMatchType } from './ea-match-type';\nimport { Injectable, Logger } from '@nestjs/common';")
replace(server + 'ea/ea.service.ts', "    return this.runBridge('matches', [platform, String(clubId), matchType, String(count)]);", """    const matches = await this.runBridge('matches', [platform, String(clubId), matchType, String(count)]);
    if (!Array.isArray(matches)) throw new Error('Invalid upstream match response');
    // The numeric per-club type is not the textual category used by the embed.
    return matches.filter((raw): raw is EaRawMatch => raw !== null && typeof raw === 'object')
      .map(raw => withEaMatchType(raw, matchType));""")
replace(server + 'ea/ea.service.ts', "      matchType: trackedClubData?.matchType ? String(trackedClubData.matchType) : 'League',", "      matchType: resolveEaMatchType(raw),\n      matchTypeLabel: formatEaMatchType(resolveEaMatchType(raw)),")
replace(server + 'discord/embeds/ea-embed.builder.ts', "import { ParsedEaMatch, ParsedEaPlayer } from '../../ea/ea.types';", "import { ParsedEaMatch, ParsedEaPlayer } from '../../ea/ea.types';\nimport { formatEaMatchType } from '../../ea/ea-match-type';")
replace(server + 'discord/embeds/ea-embed.builder.ts', """export function formatMatchType(matchType: string): string {
  const normalized = (matchType || '').toLowerCase();
  if (normalized.includes('friendly')) return 'Friendly Match';
  if (normalized.includes('playoff')) return 'Playoff Match';
  return 'League Match';
}""", """// Retain the existing export for callers while using one category formatter.
export function formatMatchType(matchType: unknown): string {
  return formatEaMatchType(matchType);
}""")
for file, count in [('ea/ea-poller.service.ts', 2), ('ea/ea.controller.ts', 1)]:
    path = server + file
    source = Path(path).read_text()
    Path(path).write_text("import { mergeEaMatch } from './ea-match-type';\n" + source)
    replace(path, 'rawMatchesMap.set(String(m.matchId), m);', 'rawMatchesMap.set(String(m.matchId), mergeEaMatch(rawMatchesMap.get(String(m.matchId)), m));', count)
web = 'ryvl-discord-bot/web/src/app/features/'
replace(web + 'public/club.component.ts', "{{ match.matchType === '1' || match.matchType === 1 ? 'League Match' : 'Pro Clubs Match' }}", "{{ match.matchTypeLabel || 'Pro Clubs Match' }}")
replace(web + 'ea-tracker/ea-tracker.component.ts', "{{ match.matchType || 'League Match' }}", "{{ match.matchTypeLabel || 'Pro Clubs Match' }}")
print('Applied only category provenance, formatting, deduplication and tracker labels.')
