# RYVL Esports — Website & Discord Bot

**Website: https://ryvl.top** · [Administration](https://ryvl.top/admin/dashboard) · [Deployment guide](ORACLE_VM_DEPLOYMENT.md)

RYVL's public team website and Discord management application. A NestJS backend serves the Angular website, manages events and lineup images, and synchronizes VPG Romania and EA Pro Clubs information.

## Features

| Area | What it does |
|---|---|
| Public website | Team pages, Match Center, Performance tabs, club tracker, VPG transfers and the contact / trial forms |
| Website forms | Validated and rate-limited; every submission is stored (Admin → Server → Website forms) and posted to the contact or recruitment channel of the server in `RYVL_GUILD_ID` (else the oldest server with that channel set) |
| VPG Superliga feeds | Standings, daily fixtures and new results in general and RYVL-only channels (see below); `/superliga`, `/live_results`, `/ryvl` |
| VPG transfers | Per-server polling (60–3600 s, default 120 s); each new Superliga România transfer is posted once and failed sends are retried; `/vpg_transfers` |
| EA Pro Clubs tracking | The primary club (`/ea_setup`) and any number of extra clubs (`/track_team`) are polled every 90 s by default. Results are posted with player stats, every tracked club keeps an Elo rating, and members link their gamertag with `/register-player` |
| Superliga Awards | Links every Superliga result to the EA match that was played and ranks players by MVP score; recorded Team of the Week picks break ties. Admin → Superliga Awards, `/superliga_mvp` |
| Team of the Week | Per-league image built from VPG stats, posted on each config's cron schedule (default Saturday 20:00 in the server time zone) or with `/totw post`. Superliga picks are recorded weekly for the Awards |
| Events | Created in Discord (`/event create`) or the web, one-off or recurring, with RSVP buttons. A new event is announced immediately; later occurrences of a series are announced their publish lead time before kickoff (default 2 days). Match events can be created from RYVL's upcoming VPG fixtures. Finished events are archived and removed after 180 days |
| Lineups | Formation editor and drafts linked to an event: members show their RSVP status, EA name and preferred position, accepted RSVPs can be auto-filled, and a posted lineup image can be updated in place. `/lineup_post` is the Discord wizard |
| Tournaments | Standard (groups of 4, top two to single-match knockouts, bracket of 8/16/32 teams) or FC Draft (draft wheel, 4 jokers per team, snake order). Each gets its own Discord category with sign-up and score-report buttons; `/tournament` |
| Administration | Channels, competitions, polling controls, immediate checks and repair of old club links |

The full, always current list of slash commands is on the website at **/docs**, generated from the commands the bot registers.

## Permissions

- **Website admin.** Discord login. Every admin route under `/api/guilds/:guildId` requires the server owner, Administrator or **Manage Server** in that server. The public site's reads stay open.
- **Slash commands.** Commands that only configure or post (`/ea_setup`, `/ea_latest`, `/track_team`, `/lineup_post`, `/totw`, `/superliga_mvp`, `/create_tournament`) default to Manage Server; a server admin can widen that in Server Settings → Integrations. Commands that mix public and admin parts stay visible, and the bot checks Manage Server for their admin subcommands (`/event create|delete`, `/ryvl setup`, `/live_results setup|check`, `/vpg_transfers setup|check`). `/track_team` and `/superliga_mvp` always check Manage Server themselves.
- **Tournaments.** Admin subcommands and buttons accept Manage Server or a tournament admin role set in the dashboard.
- **Event buttons.** Edit and Delete on an announcement work for the event's creator and for members with Manage Events or Manage Server.

## Strict RYVL identity

Only normalized **RYVL** and **RYVL Esports** names are accepted. `Rival United`, `NotRYVL` and `RYVL Academy` are different teams. Where VPG supplies a stable team slug, the correct league-table entry is resolved and that slug is preferred; the public match API currently supplies team names.

General Superliga channels include all clubs. Team-only feeds and performance calculations never use a loose `rival` substring. No matching RYVL entry in the selected competition/season means no RYVL matches, not another club's record.

## Automatic Discord posting

Configure destinations in **Admin → Server → Channels**, then open **Admin → Superliga → Notifications**.

| Feed | Default schedule | Destination |
|---|---|---|
| Superliga standings | Sunday **10:00 Europe/Bucharest** | General standings channel |
| RYVL league position | Sunday **10:00 Europe/Bucharest** | RYVL leaderboard channel |
| General fixtures | **10:00 daily**, configurable; that Romanian date only | General fixtures channel |
| RYVL fixtures | Same schedule, filtered to RYVL | RYVL fixtures channel |
| General results | Every **120 seconds**, configurable from 1–60 minutes | General results channel |
| RYVL results | Same polling setting, independently delivered | RYVL results channel |

The backend uses `Europe/Bucharest`, including summer/winter clock changes, not the VM's UTC clock. The VM/backend must be running. A missed weekly job can catch up later the same Sunday, without repeated posts.

After the daily posting time, fixtures are rechecked at the configured interval. Empty days produce no messages. Late additions, rescheduling and corrected scores update tracked messages where possible. Large fixture lists are split into bounded messages.

### Delivery safeguards

- New result destinations establish a persistent historical baseline without flooding Discord. An empty initial season is also initialized, so its first future result is not missed.
- Receipts are independent per guild, channel, competition and item. A general-channel success does not consume a RYVL-channel delivery.
- Failed sends/edits remain retryable. The panel shows the last check and background errors. Temporary API failures back off.
- Complete pagination is required before advancing the baseline. Partial snapshots are rejected.
- Database leases prevent overlapping automatic/manual checks; Discord nonces reduce duplicates on short retries. This is not perfect exactly-once delivery across an arbitrary crash between Discord and the database write.
- **Check now** retains deduplication. Manual broadcast actions intentionally allow historical summaries.

## Domain, OAuth and website links

The canonical origin is **https://ryvl.top**. HTTP and `www.ryvl.top` redirect to it, retaining paths/query strings. Caddy manages trusted TLS certificates and renewal. NestJS remains behind Caddy on `127.0.0.1:3000`; never replace that internal upstream with the public domain.

Configure the real production file at `ryvl-discord-bot/server/.env`:

```env
FRONTEND_URL=https://ryvl.top
DISCORD_OAUTH_REDIRECT_URI=https://ryvl.top/api/auth/discord/callback
PORT=3000
```

Optional: `RYVL_GUILD_ID=<server id>` pins the Discord server whose competitions and club the public site shows and which receives the website forms. Unset, the oldest server the bot is in is used (for forms: the oldest one with that form channel set).

Register the exact callback in Discord Developer Portal → OAuth2 → Redirects. `FRONTEND_URL` is also used for CORS and Discord website buttons; `WEB_BASE_URL` is obsolete. The Angular production API uses the browser's current origin. Localhost values belong only to local development.

The deployment updates just the public URL values in the VM `.env`, backs up that file outside Git with private permissions, and explicitly refreshes PM2's cached public environment values. Database credentials, Discord credentials and the JWT secret are not replaced or printed.

Previously posted Discord messages keep their stored URLs. **Repair old club links** updates buttons in up to 200 recent recorded, bot-owned club messages. It requires Administrator/Manage Server permission and confirmation; it does not delete messages or replay history. Repeat it after a future domain change.

### DNS and deployment access

Spaceship nameservers: `launch1.spaceship.net` and `launch2.spaceship.net`.

| Type | Host | Value |
|---|---|---|
| A | `@` | `130.61.228.100` |
| CNAME | `www` | `ryvl.top` |

The Oracle IP remains in DNS and the GitHub **ORACLE_HOST** SSH secret. It is not a public website URL. Keep deployment SSH separate from website routing. Do not change email/verification records or add an AAAA record without working IPv6.

### Social accounts and public navigation

Central configuration: `web/src/app/features/public/presentation.ts`.

- Discord: https://discord.gg/nEvvHvqZQX
- Twitch: https://twitch.tv/ryvlesports
- YouTube: https://www.youtube.com/@ryvlesports

`/live` redirects to `/match-center`. The removed public `/competitions` page redirects to `/performance`; admin competition settings remain. Performance tabs change panels in place and retain the selected competition. Privacy Policy and Terms of Service are real routes; the operator must review legal/contact details and retention practices. Inter is loaded from the publisher CDN, disclosed in the privacy page.

## Runtime

Backend: NestJS, TypeScript, discord.js, Prisma/PostgreSQL. Frontend: Angular 22 standalone components, signals, modern control flow and Tailwind CSS 4. Use a current compatible **Node.js 22**, at least **22.22.3** for the checked-in toolchain. Linux images need fontconfig, Liberation Sans and DejaVu for Sharp; the EA bridge needs Python 3 and `server/.venv` with `requirements-ea.txt`.

## Installation and deployment

See [ORACLE_VM_DEPLOYMENT.md](ORACLE_VM_DEPLOYMENT.md) for the complete Oracle, networking/firewall, SSH, runtime, Caddy, environment, database and GitHub Actions instructions.

```bash
# New installation only; do not overwrite an existing production .env.
git clone https://github.com/bogdantoma27/ryvl-bot-v2.git
cd ryvl-bot-v2/ryvl-discord-bot/server
npm ci
cp -n .env.example .env
nano .env
npx prisma generate
# Only on a NEW, empty database (after checking DATABASE_URL):
npx prisma db push
npm run build
```

Existing databases are upgraded only with `bash ryvl-discord-bot/deploy/apply-schema.sh`, which the deploy runs; see Database safety below.

Local development: configure the actual Angular origin in `FRONTEND_URL` and register `http://localhost:3000/api/auth/discord/callback`. Run `npm run start:dev` in `server` and `npm ci && npm start` in `web`, from separate terminals. `.env.example` is a template, not live configuration.

### GitHub Actions and branches

**`main` is the production branch.** Changes under `ryvl-discord-bot/**` trigger `.github/workflows/deploy-oracle.yml`. Validation runs before deployment; the VM deploys the validated commit rather than silently fetching an untested newer revision. Manual **Run workflow** is available. The deploy serializes runs, builds both projects before restarting, stages frontend releases, waits for trusted TLS and verifies the public API/OAuth callback and release revision.

The old `update/vpg-automation-public-ux` branch retains the earlier development/test history. Its application directory and documentation were incorporated in the main release `0fbdb979`; it is not a separate or newer production version. Do not switch the VM to it. Branch commit counts can differ after a squash-style release even when application files are identical.

### Database safety

`server/prisma/deploy/*.sql` are the reviewed transactional, additive upgrades, applied in order by `deploy/apply-schema.sh` (run it with `DATABASE_URL` set). Each is safe to repeat and never resets guilds, channels, events or match history. To change the schema: edit `schema.prisma`, add a new idempotent `prisma/deploy/<area>-fixes.sql` (`BEGIN; SELECT pg_advisory_xact_lock(739201630); … COMMIT;` with `IF NOT EXISTS` guards) and append it to the `FILES` list in `apply-schema.sh`. CI applies the list to a database built from the previous schema and fails if the result differs from `schema.prisma`. Never use `prisma db push` or `--force-reset` on production data. Back up production PostgreSQL regularly.

## Tests

```bash
cd ryvl-discord-bot/server
npm ci
npx prisma generate
npm test
cd ../web
npm ci
npm run build
npm test -- --watch=false
cd ../..
python3 -m unittest discover -s ryvl-discord-bot/deploy/test -v
```

CI covers strict team identity, Romanian scheduling/DST, pagination, independent deliveries/retries/corrections, public URLs/CORS, slash-command routing and permissions, additive database upgrades and desktop/mobile browser smoke scenarios. Integration database tests require `RUN_DATABASE_TESTS=1` and a disposable local database whose name starts with `ryvl_` (for example `ryvl_ci`); production deployment does not enable them. Environment tests use fake credentials in temporary directories.

After deployment, `deploy/verify-public-site.mjs` checks real public DNS/TLS, redirects, pages, API, OAuth callback and `/release.json`. It does not sign in as a user or post to Discord. Test a real Discord admin login after the domain transition; browser storage does not transfer between origins.
