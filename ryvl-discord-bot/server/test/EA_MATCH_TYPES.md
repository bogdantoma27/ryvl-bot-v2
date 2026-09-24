# EA match categories

The requested EA `matchType` feed is retained with each response before feeds are combined. `parseMatch` returns a canonical category plus `matchTypeLabel`; Discord, public Club Tracker and the admin tracker use the same labels. Raw per-club numeric values are preserved, not overwritten or treated as league by default.

- League, friendly and playoff feeds use their corresponding labels.
- Explicit named practice metadata is supported, without guessing from opponents, scores or the number of players.
- Missing/unknown category evidence is displayed as **Pro Clubs Match**.
- If a match ID appears in contradictory feeds without a clear named response type, deduplication keeps one match with a neutral label rather than whichever feed was processed last.
- Persisted raw payloads include the source categories for future inspection. This change does not replay or edit historical Discord messages and does not alter processing checkpoints.

## Live check, 24 September 2026

A read-only check of the configured EA tracker found numeric club type `1` in the league feed and `5` in the friendly feed; the old formatter treated both as League. The playoff request returned an empty list. EA rejected a `practiceMatch` query with HTTP 400 (`Invalid query parameter: matchType`). Therefore no unsupported practice query has been added to the default polling configuration. A training/scrimmage game returned by EA's friendly feed is labelled **Friendly Match** unless the response explicitly identifies another supported named type. Synthetic practice fixtures in the regression tests verify safe rendering, not the availability of an EA practice endpoint.

`npm test` includes `ea-match-type.test.cjs`. It exercises the real fetch boundary, parser, automated polling, manual latest posting, API output and embed formatting with intercepted EA, database and Discord collaborators. No test sends a real Discord message.
