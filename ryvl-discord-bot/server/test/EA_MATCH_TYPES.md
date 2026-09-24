# EA match classification

The Discord result embed, manual `post-latest` flow and Club Tracker pages use the same canonical match category and display label.

## Source of truth

`EaService.fetchMatchesRaw` stamps each response with `sourceMatchTypes`, containing the exact requested EA category. This survives merging, parsing and JSON persistence in `ProcessedEaMatch.rawPayload`. The numeric `clubs[clubId].matchType` field is not treated as a human-readable category or defaulted to league.

An explicit recognized category name in the response is accepted. Otherwise a single known request category is used. Unknown data or conflicting source categories produce `unknown` / **Pro Clubs Match**, never an invented **League Match**. Repeated IDs are deduplicated while retaining their source categories.

| Canonical value | Display label |
|---|---|
| `leagueMatch` | League Match |
| `friendlyMatch` | Friendly Match |
| `playoffMatch` | Playoff Match |
| `practiceMatch` (only when explicitly identified) | Practice Match |
| `unknown` | Pro Clubs Match |

## Practice versus friendly

A read-only check on 2026-09-24 found league responses carrying club type `"1"` and friendly responses carrying `"5"`, with no top-level match type. The old embed formatter defaulted both numeric strings to League Match.

The same check found the EA endpoint rejects `matchType=practiceMatch` with HTTP 400 (`Invalid query parameter: matchType`). Do not add this to the production polling defaults. The parser supports an explicitly supplied named practice type, but this is not proof that EA provides a separate practice feed. A training/scrim game returned by EA as a friendly is labelled Friendly Match unless EA provides reliable, more specific metadata. The application cannot infer the team's intended use of a match from its score, time or participants.

Existing tracker configuration, polling frequency, saved receipts, scores and Discord messages are not changed by deployment. New automatic and manually requested posts use the corrected classification. Historical messages are not rewritten or replayed automatically.

## Regression checks

`server/test/ea-match-category.test.cjs` exercises the real fetch-normalization, parsing, embedding, poller and public-controller paths with external I/O substituted. It covers all named categories, neutral fallback, malformed/numeric values, JSON round-tripping, repeated polls and duplicate IDs across category feeds. `web/test/ea-category-regressions.cjs` checks the compiled Club Tracker labels in a browser using isolated API responses. No tests post messages to live Discord channels.
