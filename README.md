# RYVL Esports — Website & Discord Bot

**Website: https://ryvl.top** · [Administration](https://ryvl.top/admin/dashboard) · [Deployment guide](ORACLE_VM_DEPLOYMENT.md)

RYVL's public team website and Discord management application. A NestJS backend serves the Angular website, manages events and lineup images, and synchronizes VPG Romania and EA Pro Clubs information.

## Features

| Area | What it does |
|---|---|
| Public website | Team information, recruitment/contact forms, club tracker, VPG Romania transfers, Match Center and in-page Performance tabs |
| RYVL Performance | Competition selector, form/statistics, RYVL-only results/fixtures and the full league table with RYVL highlighted |
| VPG Romania transfers | Configurable transfer polling and Discord notifications, independent of competition-result polling |
| General Superliga feeds | Standings, daily fixtures and newly confirmed results in configured Discord channels |
| RYVL-only feeds | Results, fixtures and weekly league position in active configured competitions/seasons |
| Events | Discord/web creation, recurrence, RSVP buttons and attendance management |
| Lineups | Formation editor, player assignments, saved drafts and server-rendered PNG images |
| EA club tracker | Match information and Discord posts with a public website button |
| Administration | Channels, competition slots, polling controls, immediate checks and repair of old club links |

### Strict RYVL identity

Only normalized **RYVL** and **RYVL Esports** names are accepted. `Rival United`, `NotRYVL` and `RYVL Academy` are different teams. Where VPG supplies a stable team slug, the correct league-table entry is resolved and that slug is preferred; the public match API currently supplies team names.

General Superliga channels include all clubs. Team-only feeds and performance calculations never use a loose `rival` substring. No matching RYVL entry in the selected competition/season means no RYVL matches, not another club's record.

## Automatic Discord posting

Configure destinations in **Admin → Settings**, then open **Admin → RYVL Performance → VPG automatic posting**.

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
# Only after verifying DATABASE_URL points to the intended NEW database:
npx prisma db push
npm run build
```

Local development: configure the actual Angular origin in `FRONTEND_URL` and register `http://localhost:3000/api/auth/discord/callback`. Run `npm run start:dev` in `server` and `npm ci && npm start` in `web`, from separate terminals. `.env.example` is a template, not live configuration.

### GitHub Actions and branches

**`main` is the production branch.** Changes under `ryvl-discord-bot/**` trigger `.github/workflows/deploy-oracle.yml`. Validation runs before deployment; the VM deploys the validated commit rather than silently fetching an untested newer revision. Manual **Run workflow** is available. The deploy serializes runs, builds both projects before restarting, stages frontend releases, waits for trusted TLS and verifies the public API/OAuth callback and release revision.

The old `update/vpg-automation-public-ux` branch retains the earlier development/test history. Its application directory and documentation were incorporated in the main release `0fbdb979`; it is not a separate or newer production version. Do not switch the VM to it. Branch commit counts can differ after a squash-style release even when application files are identical.

### Database safety

`server/prisma/deploy/vpg-notifications.sql` is the reviewed transactional, additive notification upgrade. It creates tables/indexes and is safe to repeat; it does not reset guilds, channels, events or match history. The workflow applies this specific script, not arbitrary future schema changes. Never use `prisma db push --force-reset` on valuable data. Back up production PostgreSQL regularly.

## Tests

```bash
cd ryvl-discord-bot/server
npm ci
npx prisma generate
npm test
cd ../web
npm ci
npm run build
cd ../..
python3 -m unittest discover -s ryvl-discord-bot/deploy/test -v
```

CI covers strict team identity, Romanian scheduling/DST, pagination, independent deliveries/retries/corrections, public URLs/CORS, additive database upgrades and desktop/mobile browser smoke scenarios. Integration database tests require `RUN_DATABASE_TESTS=1` and a disposable local `ryvl_ci` database; production deployment does not enable them. Environment tests use fake credentials in temporary directories.

After deployment, `deploy/verify-public-site.mjs` checks real public DNS/TLS, redirects, pages, API, OAuth callback and `/release.json`. It does not sign in as a user or post to Discord. Test a real Discord admin login after the domain transition; browser storage does not transfer between origins.
