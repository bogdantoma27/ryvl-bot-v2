# Event scheduling and announcement regression checks

Event dates entered in Discord use the guild timezone, defaulting to `Europe/Bucharest`. Editing an occurrence uses the timezone saved on its event. The VM may remain on UTC.

- Enter dates as `YYYY-MM-DD`, `today`, `tomorrow`, or a weekday (optionally prefixed with `next`). Relative dates are resolved when the form is submitted. A weekday means its next future occurrence; it does not add an extra week.
- Enter time in 24-hour `HH:mm` format. Invalid dates, blank/malformed times and local minutes skipped by the spring clock change are rejected, not converted to midnight or another date.
- `today` remains today even when the specified time has already passed. Normal expiry processing still applies to past events.
- Both the edit form and the explicit date/time in the embed use the event timezone. Discord's native timestamp additionally adapts to each viewer's device timezone.
- A time/date edit targets the occurrence whose announcement was clicked, preserving its ID, message ID and RSVPs. For a recurring event, this changes that occurrence's date; title/description are shared event metadata. Duration edits keep existing start times.
- Published announcements are refreshed after both Discord and web edits. Failed Discord refreshes are reported separately from the successful database save. Retrying an edit retries the refresh instead of posting another announcement. The bot must be able to view the channel and read its message history.
- The existing admin form's date/time, duration and recurrence options are converted to the canonical event DTO before Zod validation. Weekly wall-clock recurrences created through that form retain their local hour across daylight-saving changes.

No deployment automatically adjusts existing event dates, deletes announcements or clears RSVPs: historical input intent cannot safely be inferred. Correct an existing wrong date/time with a fresh edit after deployment.

## Tests

`npm test` includes command-handler, embed, validation and scheduling tests. Real database tests require `RUN_DATABASE_TESTS=1` and a **disposable** test database. CI provisions its own PostgreSQL service; do not point these tests at the production database.

`event-time-edit.test.cjs` uses fake clocks and mocked external collaborators. It can additionally run with `TZ=America/New_York` or `TZ=Asia/Tokyo` to detect accidental dependencies on the server's timezone. `event-delivery.test.cjs` calls the real embed-updater with intercepted REST methods, not Discord. `event-update-database.test.cjs` and `event-series-edit.test.cjs` verify row/message/RSVP identities using real PostgreSQL transactions.
