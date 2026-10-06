# Database guide

The backend uses the PostgreSQL database named by `DATABASE_URL` in `ryvl-discord-bot/server/.env` on the VM. Production currently points at a hosted **Supabase PostgreSQL** database; a PostgreSQL installed on the Oracle VM itself is only an optional alternative (section 4). Deployment never resets or recreates the database.

## 1. Local development is isolated

- Locally the backend uses the `DATABASE_URL` of your local `server/.env` (a local PostgreSQL or the Docker Compose `db` service). Never point it at production.
- The VM does not expose a database port; OCI security rules and the Ubuntu firewall only allow 22, 80 and 443.
- CORS only allows `FRONTEND_URL` (plus `localhost:4200` when `FRONTEND_URL` itself is a localhost origin).
- If your local `.env` uses the production `DISCORD_TOKEN`, your machine and the VM both answer Discord interactions. Use a separate test application and bot token, or stop production briefly with `pm2 stop ryvl-backend` and start it again afterwards.

## 2. Schema changes

`prisma/schema.prisma` is the model; the production database is upgraded only by the reviewed SQL files in `server/prisma/deploy/`, applied in order by:

```bash
cd ~/ryvl-bot-v2
DATABASE_URL=... bash ryvl-discord-bot/deploy/apply-schema.sh   # the deploy runs this with server/.env
```

Each file runs in one transaction, takes the advisory lock `739201630`, only adds things (`IF NOT EXISTS`, never drops or renames columns with data) and can be run any number of times.

To change the schema:

1. Edit `schema.prisma` (additive and backward compatible).
2. Add `server/prisma/deploy/<area>-fixes.sql` with the matching idempotent SQL, wrapped in `BEGIN; SELECT pg_advisory_xact_lock(739201630); … COMMIT;`.
3. Append the file to the `FILES` list in `deploy/apply-schema.sh`.
4. Check on a disposable database built from the previous schema: run `apply-schema.sh` twice, then `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code` must report no difference. CI does the same.

`npx prisma db push` is only for a brand-new, empty database. Never run it, or anything with `--force-reset`, against production.

## 3. Backups

Back up the production database independently of deployments. For a hosted database, also enable the provider's own backups. A simple daily dump on the VM:

```bash
mkdir -p ~/backups/postgres && chmod 700 ~/backups
cat > ~/backups/backup_db.sh <<'SCRIPT'
#!/bin/bash
set -euo pipefail
cd ~/ryvl-bot-v2/ryvl-discord-bot/server
DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
FILE=~/backups/postgres/ryvl_$(date +%Y%m%d_%H%M%S).sql.gz
pg_dump "$DATABASE_URL" | gzip > "$FILE"
find ~/backups/postgres -name 'ryvl_*.sql.gz' -mtime +14 -delete
echo "[$(date)] backup written: $FILE"
SCRIPT
chmod 700 ~/backups/backup_db.sh
```

`pg_dump` must be the same major version as the server or newer (`sudo apt install postgresql-client-<version>`). Schedule it with `crontab -e`:

```cron
0 3 * * * ~/backups/backup_db.sh >> ~/backups/backup.log 2>&1
```

Restore into an empty database, with `DATABASE_URL` exported in the shell (never over a live database without a fresh dump first):

```bash
pm2 stop ryvl-backend
gunzip -c ~/backups/postgres/ryvl_YYYYMMDD_HHMMSS.sql.gz | psql "$DATABASE_URL"
pm2 start ryvl-backend
```

The dumps contain member data and settings: keep them private and out of Git.

## 4. Optional: PostgreSQL on the VM

Only if you move production off the hosted database:

```bash
sudo apt update && sudo apt install -y postgresql
sudo -u postgres psql <<'EOF'
CREATE USER ryvl WITH ENCRYPTED PASSWORD 'choose-a-strong-password';
CREATE DATABASE ryvl OWNER ryvl;
EOF
```

Keep it bound to `127.0.0.1`, set `DATABASE_URL=postgresql://ryvl:<password>@127.0.0.1:5432/ryvl` in `server/.env`, restore a dump of the current production database into it (section 3), run `apply-schema.sh`, then `pm2 restart ryvl-backend --update-env`.
