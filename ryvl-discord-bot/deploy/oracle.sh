#!/usr/bin/env bash
# Run as ubuntu from the repository root. The caller holds ~/.ryvl-deploy.lock.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
SERVER="$ROOT/ryvl-discord-bot/server"
WEB="$ROOT/ryvl-discord-bot/web"
RELEASE_SHA="$(git rev-parse HEAD)"
ORIGIN="https://ryvl.top"
CALLBACK="$ORIGIN/api/auth/discord/callback"
STATE="$HOME/.local/state/ryvl-deploy"
install -d -m 700 "$STATE"

# Keep build dependencies available; production mode is applied only to PM2.
unset NODE_ENV
if ! node -e 'const [a,b,c]=process.versions.node.split(".").map(Number);process.exit(a===22&&(b>22||(b===22&&c>=3))?0:1)' 2>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node --version
npm --version

# Minimal Ubuntu images need fonts for Sharp and a venv for the EA bridge.
MISSING=0
for pkg in fontconfig fontconfig-config fonts-dejavu-core fonts-liberation2 python3 python3-venv; do
  if ! dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q 'install ok installed'; then MISSING=1; fi
done
if [ "$MISSING" -eq 1 ]; then
  sudo apt-get update
  sudo apt-get install -y fontconfig fontconfig-config fonts-dejavu-core fonts-liberation2 python3 python3-venv
fi
sudo fc-cache -f
fc-match 'Liberation Sans'
command -v caddy >/dev/null
command -v pm2 >/dev/null

cd "$SERVER"
if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi
.venv/bin/python -m pip install -r requirements-ea.txt
npm ci
npx prisma generate
npm test
python3 -m unittest discover -s "$ROOT/ryvl-discord-bot/deploy/test" -v
cd "$WEB"
npm ci
npm run build
WEB_DIST="$WEB/dist/web/browser"
if [ ! -s "$WEB_DIST/index.html" ]; then WEB_DIST="$WEB/dist/web"; fi
test -s "$WEB_DIST/index.html"
sudo caddy validate --config "$ROOT/ryvl-discord-bot/Caddyfile" --adapter caddyfile

# This is the existing reviewed additive upgrade, never a reset or blanket db push.
cd "$SERVER"
npx prisma db execute --schema prisma/schema.prisma --file prisma/deploy/vpg-notifications.sql

# Publish a complete release without deleting files from the current release.
printf '{"revision":"%s"}\n' "$RELEASE_SHA" > "$WEB_DIST/release.json"
RELEASE_DIR="/var/www/ryvl-releases/$RELEASE_SHA"
sudo mkdir -p "$RELEASE_DIR"
sudo cp -a "$WEB_DIST"/. "$RELEASE_DIR"/
sudo chown -R caddy:caddy "$RELEASE_DIR"
if [ -d /var/www/ryvl ] && [ ! -L /var/www/ryvl ]; then
  sudo mv /var/www/ryvl "/var/www/ryvl-legacy-$(date +%s)"
fi
# The temporary link is owned by this deployment and can be safely replaced on a retry.
sudo ln -sfn "$RELEASE_DIR" "/var/www/ryvl-next-$RELEASE_SHA"
sudo mv -Tf "/var/www/ryvl-next-$RELEASE_SHA" /var/www/ryvl

# DNS and the Discord callback have been configured before this domain cutover.
# Keep a Caddy backup. Do not change public .env URLs until both certificates work.
CADDY_BACKUP="$STATE/Caddyfile-$RELEASE_SHA-$(date +%s)"
sudo cp /etc/caddy/Caddyfile "$CADDY_BACKUP"
sudo chmod 600 "$CADDY_BACKUP"
sudo install -m 644 "$ROOT/ryvl-discord-bot/Caddyfile" /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
TLS_READY=0
for attempt in $(seq 1 36); do
  ROOT_CODE="$(curl --silent --output /dev/null --write-out '%{http_code}' --connect-timeout 3 --max-time 8 --resolve ryvl.top:443:127.0.0.1 "$ORIGIN/" || true)"
  WWW_CODE="$(curl --silent --output /dev/null --write-out '%{http_code}' --connect-timeout 3 --max-time 8 --resolve www.ryvl.top:443:127.0.0.1 https://www.ryvl.top/ || true)"
  if [ "$ROOT_CODE" = 200 ] && [ "$WWW_CODE" = 308 ]; then TLS_READY=1; break; fi
  echo "Waiting for both trusted TLS certificates (attempt $attempt/36)..."
  sleep 5
done
if [ "$TLS_READY" -ne 1 ]; then
  echo 'TLS preflight failed. Restoring the previous Caddy configuration; public environment URLs were not changed.' >&2
  sudo cp "$CADDY_BACKUP" /etc/caddy/Caddyfile
  sudo systemctl reload caddy
  exit 1
fi

# Only public URLs are changed. The helper backs up .env outside Git with mode 600.
python3 "$ROOT/ryvl-discord-bot/deploy/set_public_origin.py" "$SERVER/.env" \
  --origin "$ORIGIN" --backup-dir "$STATE/env-backups"
# PM2 retains old process environment values, which override .env in ConfigModule.
# Explicitly replace those public values as well, without displaying any secrets.
NODE_ENV=production FRONTEND_URL="$ORIGIN" DISCORD_OAUTH_REDIRECT_URI="$CALLBACK" WEB_BASE_URL="$ORIGIN" \
  pm2 restart ryvl-backend --update-env
BACKEND_READY=0
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 5 http://127.0.0.1:3000/api/health >/dev/null; then BACKEND_READY=1; break; fi
  sleep 2
done
test "$BACKEND_READY" -eq 1
pm2 save
# TLS validation is strict: no -k / insecure mode. The separate runner check
# verifies public DNS, port 443, redirects, OAuth and the deployed revision.
curl --fail --silent --resolve ryvl.top:443:127.0.0.1 "$ORIGIN/api/health" \
  | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{if(JSON.parse(s).status!=="ok")process.exit(1)})'
echo "Domain deployment complete: $RELEASE_SHA -> $ORIGIN"
pm2 status ryvl-backend
sudo systemctl is-active caddy
