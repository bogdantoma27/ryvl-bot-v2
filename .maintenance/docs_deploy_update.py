from pathlib import Path
import json

readme = r'''# RYVL Esports — Website & Discord Bot

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
'''
Path('README.md').write_text(readme, encoding='utf-8')

p=Path('ORACLE_VM_DEPLOYMENT.md');s=p.read_text()
s+=r'''

---

## 26. VPG notifications, public website and current deployment safeguards

The current feature overview and feed/channel mapping are maintained in [README.md](README.md). The public site now includes VPG Romania transfers, Match Center, in-page RYVL Performance tabs and working `/privacy` and `/terms` routes. The public Competitions page is removed; its URL redirects to Performance. The admin competition slots are not removed.

### Administration

1. Keep your existing channel selections in **Admin → Settings**.
2. Open **Admin → RYVL Performance → VPG automatic posting**.
3. Enable the desired general and/or RYVL-only feeds. A missing channel means that feed will not post.
4. Set the results polling interval (default 2 minutes) and daily fixture time (default 10:00).
5. Weekly standings use Sunday 10:00 **Europe/Bucharest**. This does not depend on the VM's UTC timezone.

A newly configured result destination saves a baseline without replaying old results. It will announce future newly confirmed entries. Failed sends remain retryable, and separate destinations have independent receipts. Fixture updates edit the day's tracked messages; no scheduled matches means no empty-day post. The background process records errors and applies retry backoff. API pagination is checked before any baseline advances.

### Updating existing databases

The notification upgrade is in `server/prisma/deploy/vpg-notifications.sql`. It only creates two new tables and indexes. Existing data and channel settings are not reset. The deploy workflow executes this reviewed, transactional SQL after successful backend/frontend builds and before restarting PM2. It can be run again safely.

For a manual upgrade, from the backend folder with the correct `.env`:

```bash
npx prisma generate
npm run build
npx prisma db execute --schema prisma/schema.prisma --file prisma/deploy/vpg-notifications.sql
pm2 restart ryvl-backend --update-env
```

Do not substitute `--force-reset`. This is a narrowly scoped upgrade, not permission to automatically apply arbitrary future destructive schema changes.

### Website buttons and custom domain later

Use `FRONTEND_URL` as the public website base for Discord club buttons. The old `WEB_BASE_URL` localhost fallback has been removed. Example for the existing HTTP deployment:

```env
FRONTEND_URL=http://130.61.228.100
DISCORD_OAUTH_REDIRECT_URI=http://130.61.228.100/api/auth/discord/callback
```

After adding DNS and HTTPS in Caddy, change both URLs to your domain and update the Discord Developer Portal callback. Restart the backend. To repair already-posted buttons, use **Repair old club links** in the notification panel. This explicit action edits known bot-owned messages only, with a 200-message limit; it does not remove or replay match posts.

### Deployment verification

The workflow now serializes deployments, takes a VM-side lock, builds both projects and runs non-network regression tests before restarting PM2. The reviewed additive notification SQL is applied before the new code starts. Frontend files are staged in a release directory and switched into place after validation. The old physical `/var/www/ryvl` directory is retained as a legacy backup on its first conversion to a release symlink. The workflow does not modify the live `.env`.

Verify locally after deployment:

```bash
curl --fail http://127.0.0.1:3000/api/health
curl --fail http://127.0.0.1/api/health
pm2 status ryvl-backend
sudo systemctl is-active caddy
```

### Privacy and transport

The legal pages document current app behavior, including Discord authentication, browser token storage, form forwarding and externally requested fonts/images. They are not a substitute for the operator reviewing legal identity/contact details and retention obligations. Public typography loads Inter from the publisher CDN. HTTP is still only the initial IP-based deployment; configure HTTPS before considering the administration environment production-hardened.
'''
p.write_text(s, encoding='utf-8')

# Retain existing scripts except replacing a nonfunctional Jest command with the checked-in regression suite.
p=Path('ryvl-discord-bot/server/package.json');pkg=json.loads(p.read_text());pkg['scripts']['test']='npm run build && node --test test/*.test.cjs';p.write_text(json.dumps(pkg,indent=2)+'\n')
p=Path('ryvl-discord-bot/.gitignore');s=p.read_text();s+='\n# Project-local Python runtime is host-specific, never source code.\n.venv/\n__pycache__/\n';p.write_text(s)
p=Path('ryvl-discord-bot/server/.env.example');s=p.read_text();s+='\n# FRONTEND_URL is also the source for Discord "View club on web" buttons.\n# Do not add a separate localhost WEB_BASE_URL in production.\n# Notification schedules/intervals and Discord channels are saved in the admin panel, not here.\n';p.write_text(s)

p=Path('.github/workflows/deploy-oracle.yml');s=p.read_text()
s=s.replace('cancel-in-progress: true','cancel-in-progress: false')
s=s.replace('timeout-minutes: 20','timeout-minutes: 25').replace('command_timeout: 17m','command_timeout: 22m')
s=s.replace('            set -euo pipefail','''            set -euo pipefail

            # Serialize manual and automated deployments on this VM as well as in Actions.
            exec 9>/home/ubuntu/.ryvl-deploy.lock
            flock -w 1200 9''')
s=s.replace('            git reset --hard origin/main','''            git reset --hard origin/main
            RELEASE_SHA="$(git rev-parse HEAD)"''')
s=s.replace('            npm run build\n\n            # Database schema changes are intentionally NOT applied automatically.', '            npm run build\n            node --test test/*.test.cjs\n\n            # General database schema changes are not automatically applied.')
old='''            echo "Restarting backend..."
            pm2 restart ryvl-backend --update-env
            pm2 save

'''
assert old in s;s=s.replace(old,'')
a=s.index('            echo "Publishing frontend..."')
b=s.index('            echo "Updating Caddy..."',a)
s=s[:a]+'''            # Do not restart the application or change the published frontend until both builds pass.
            echo "Applying reviewed additive notification tables..."
            cd /home/ubuntu/ryvl-bot-v2/ryvl-discord-bot/server
            npx prisma db execute --schema prisma/schema.prisma --file prisma/deploy/vpg-notifications.sql

            echo "Restarting backend..."
            pm2 restart ryvl-backend --update-env
            pm2 save
            BACKEND_READY=0
            for attempt in $(seq 1 30); do
              if curl --fail --silent --max-time 5 http://127.0.0.1:3000/api/health >/dev/null; then
                BACKEND_READY=1
                break
              fi
              sleep 2
            done
            test "$BACKEND_READY" -eq 1

            echo "Publishing validated frontend release..."
            RELEASE_DIR="/var/www/ryvl-releases/$RELEASE_SHA"
            sudo mkdir -p "$RELEASE_DIR"
            sudo cp -a "$WEB_DIST"/. "$RELEASE_DIR"/
            sudo chown -R caddy:caddy "$RELEASE_DIR"
            sudo test -s "$RELEASE_DIR/index.html"
            if [ -d /var/www/ryvl ] && [ ! -L /var/www/ryvl ]; then
              sudo mv /var/www/ryvl "/var/www/ryvl-legacy-$(date +%s)"
            fi
            sudo ln -s "$RELEASE_DIR" "/var/www/ryvl-next-$RELEASE_SHA"
            sudo mv -Tf "/var/www/ryvl-next-$RELEASE_SHA" /var/www/ryvl

'''+s[b:]
s=s.replace('            echo "Deployment complete."','''            curl --fail --silent --max-time 10 http://127.0.0.1/ >/dev/null
            curl --fail --silent --max-time 10 http://127.0.0.1/api/health >/dev/null
            echo "Deployment complete: $RELEASE_SHA"''')
s=s.replace('systemctl --no-pager --full status caddy | head -20','systemctl --no-pager --full status caddy')
p.write_text(s)
print('Prepared current documentation and additive, serialized deployment checks.')
