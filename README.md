# RYVL Esports — Website & Discord Bot

RYVL's public team website and Discord management application. The same NestJS backend serves the Angular website, manages events and lineup images, and synchronizes VPG Romania and EA Pro Clubs information.

## Features

| Area | What it does |
|---|---|
| Public website | Team information, recruitment/contact forms, club tracker, VPG Romania transfers, Match Center, and in-page Performance tabs |
| RYVL Performance | Competition selector, form and statistics, RYVL-only results/fixtures, and the full league table with RYVL highlighted |
| VPG Romania transfers | Configurable transfer polling and Discord notifications, independent of competition-result polling |
| General Superliga feeds | League standings, daily fixtures and newly confirmed results sent to configured Discord channels |
| RYVL-only feeds | Results, fixtures and weekly league position for RYVL in its active configured competitions/seasons |
| Events | Discord/web creation, recurrence, RSVP buttons and attendance management |
| Lineups | Formation editor, player assignment, saved drafts and server-rendered PNG images for Discord |
| EA club tracker | Match information and Discord posts with a public website link |
| Administration | Discord channel settings, competition slots, polling controls, immediate checks and controlled repair of old club links |

### RYVL identity is deliberately strict

Only normalized **RYVL** and **RYVL Esports** names are accepted. `Rival United`, `NotRYVL`, `RYVL Academy`, etc. are not the same team. When a VPG response supplies a stable team slug, the team is first resolved from the correct league table and that slug is preferred; the public match API currently supplies names rather than team slugs.

The general Superliga channels still include all clubs. Team-only channels and performance statistics never use a loose `rival` substring match. If the selected VPG competition/season contains no matching RYVL entry, the application shows no RYVL matches rather than borrowing another club's record.

## Automated Discord posting

Configure channels in **Admin → Settings**, then open **Admin → RYVL Performance → VPG automatic posting**.

| Feed | Default schedule | Destination |
|---|---|---|
| Superliga standings | Sunday at **10:00 Europe/Bucharest** | General standings channel |
| RYVL league position | Sunday at **10:00 Europe/Bucharest** | RYVL leaderboard channel |
| General fixtures | **10:00 daily**, configurable; only that Romanian date | General fixtures channel |
| RYVL fixtures | Same daily schedule, filtered to RYVL | RYVL fixtures channel |
| General results | Check every **120 seconds**, configurable from 1–60 minutes | General results channel |
| RYVL results | Same polling setting, independently delivered | RYVL results channel |

The backend uses `Europe/Bucharest` explicitly, including summer/winter clock changes. No personal calendar or GitHub scheduled workflow is involved. A running VM/backend is required. A missed Sunday job can catch up later that same Sunday; it is not posted repeatedly.

After the daily posting time, fixtures are rechecked at the configured polling interval. Empty days do not produce messages. Late additions, rescheduling and corrected scores update tracked messages where possible. Large fixture lists are split into bounded messages rather than silently truncated.

### Delivery and failure handling

* A newly configured destination establishes a persistent historical baseline without flooding Discord. Even an empty initial season is initialized, so its first future result is not missed.
* Delivery records are separate for each guild, destination channel, competition and item. A general-channel success does not consume the RYVL-channel delivery.
* Failed sends/edits remain retryable. The admin panel shows the last check and latest background error. Temporary API errors back off instead of flooding requests.
* Complete API pagination is required before advancing the baseline. Incomplete snapshots are rejected.
* Database leases prevent overlapping automatic/manual pollers, and Discord nonces reduce duplicates during short retries. This is not a claim of perfect exactly-once delivery across an arbitrary crash between Discord delivery and the database write.
* **Check now** checks immediately while retaining deduplication. Existing manual broadcast actions remain available for an intentional historical summary.

## Website links and social accounts

Backend-generated website buttons use one setting:

```env
FRONTEND_URL=http://130.61.228.100
DISCORD_OAUTH_REDIRECT_URI=http://130.61.228.100/api/auth/discord/callback
PORT=3000
```

`WEB_BASE_URL` is not needed for club links. The Angular application uses the current browser origin for production API requests. After configuring a custom HTTPS domain in DNS/Caddy, update `FRONTEND_URL`, `DISCORD_OAUTH_REDIRECT_URI`, and the matching redirect in the Discord Developer Portal. Do not hard-code the new hostname into button builders.

Previously posted Discord messages do not change themselves. **Repair old club links** updates the website buttons in up to 200 recent recorded, bot-owned club messages. It requires Administrator/Manage Server permission, asks for confirmation, and does not delete messages or replay match history.

Public links are centralized in `web/src/app/features/public/presentation.ts`:

- Discord: https://discord.gg/nEvvHvqZQX
- Twitch: https://twitch.tv/ryvlesports
- YouTube: https://www.youtube.com/@ryvlesports

`/live` redirects to `/match-center`. The removed public `/competitions` page redirects to `/performance`; admin competition configuration remains available. Performance tabs change their panel in place and retain the competition selection.

## Stack and runtime

* Backend: NestJS, TypeScript, discord.js, Prisma/PostgreSQL.
* Frontend: Angular 22 standalone components, signals, modern control flow and Tailwind CSS 4.
* Runtime: a current Node.js 22 release compatible with the checked-in Angular toolchain (at least 22.22.3 for this version).
* Images: Sharp plus fontconfig, Liberation Sans and DejaVu fonts on Linux.
* EA integration: project-local Python virtual environment and `requirements-ea.txt`.
* Hosting: Oracle Ubuntu ARM VM, PM2 and Caddy. GitHub Actions builds and deploys backend and frontend.

## Setup and deployment

The full, step-by-step instructions are in **[ORACLE_VM_DEPLOYMENT.md](ORACLE_VM_DEPLOYMENT.md)**: instance creation, public IP, both firewalls, SSH, Node, PM2, Python/fonts, Caddy, database/environment setup and deployment secrets.

```bash
# Start from the directory in which you keep repositories.
git clone https://github.com/bogdantoma27/ryvl-bot-v2.git
cd ryvl-bot-v2/ryvl-discord-bot/server
npm ci

# Only create this file on a new installation; never overwrite an existing production .env.
cp -n .env.example .env
# Edit .env with real database and Discord credentials, a random JWT secret and public URLs.
nano .env
npx prisma generate

# Only for a NEW database, after checking DATABASE_URL points to the intended database:
npx prisma db push
npm run build
```

For local development, use `FRONTEND_URL=http://localhost:4201` and `DISCORD_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback` in the backend `.env`; register that exact callback with Discord. From separate terminals, run `npm run start:dev` in `ryvl-discord-bot/server` and `npm ci && npm start` in `ryvl-discord-bot/web`.

The production `.env` is ignored by Git and stays on the VM. Never commit bot tokens, database passwords, JWT secrets or private SSH keys. The `.env.example` files are documentation templates, not the live configuration.

### Database upgrade for notification scheduling

Existing installations use the reviewed additive SQL file:

```text
ryvl-discord-bot/server/prisma/deploy/vpg-notifications.sql
```

It creates the notification settings/delivery tables and indexes only. It is transactional and safe to execute again; it does not drop or reset existing guilds, events, channels, transfers or match history. The deployment workflow applies this specific upgrade after both builds succeed and before restarting the new backend. Other schema changes are still manual/reviewed; the workflow does not run a blanket `prisma db push --force-reset`.

Back up production PostgreSQL regularly. New result destinations are baselined on their first successful check; known old general-feed message IDs are retained for corrections where available.

## Testing

```bash
cd ryvl-discord-bot/server
npm ci
npx prisma generate
npm test

cd ../web
npm ci
npm run build
```

Backend tests cover strict team filtering, Romanian date boundaries/DST, polling validation, pagination, independent delivery, retry/deduplication, corrected scores and public URLs. Database integration tests require an explicit `RUN_DATABASE_TESTS=1` and a disposable local database named `ryvl_ci`; they are never enabled in the production deployment.

The browser smoke suite is `web/test/browser-smoke.cjs`. CI runs the production Angular build in headless Chrome with deterministic API responses to check in-place tabs, competition preservation, error/empty states, legal routes, social links and mobile navigation. External VPG/Discord availability is separate from these deterministic tests.

## Repository layout

```text
README.md
ORACLE_VM_DEPLOYMENT.md
.github/workflows/deploy-oracle.yml
ryvl-discord-bot/
  Caddyfile
  server/
    .env.example
    prisma/schema.prisma
    prisma/deploy/vpg-notifications.sql
    src/vpg/                       # API readers, notification policy and delivery
    src/discord/                   # Commands, interactions and embeds
    src/lineup/                    # SVG/PNG generator
    test/                          # Backend regression tests
  web/
    src/app/features/public/       # Public website and inline performance panels
    src/app/features/performance/  # Admin competitions and notification controls
    test/browser-smoke.cjs
```

## Production notes

The IP-based Caddy configuration is HTTP-only until a domain/TLS configuration is added. Do not treat HTTP as a secure final setup for administration. The new Privacy Policy and Terms of Service are working pages describing the current application; the operator should review them, supply any required legal/contact details and define retention practices before treating the text as finalized legal documentation. Inter is loaded from the font publisher's CDN, which is disclosed in the privacy page.
