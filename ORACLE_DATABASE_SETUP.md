# Oracle Cloud VM Database & Production Isolation Guide

This document explains the architecture, database isolation, schema migration process, and backup strategies for **RYVL Esports** and the **RYVL Bot Multi-Server Management Console**.

---

## 1. Local Development vs. Production Environment Isolation

### Will running the backend locally affect the production environment?
**No.** Running the backend locally will **never** affect your production environment, database, or live website users, provided you follow standard local development practices:

1. **Database Network Isolation:**
   - **Local Database:** When running locally, your backend connects to `DATABASE_URL` specified in your local `.env` (typically `localhost:5432` or the Docker Compose container `db:5432`).
   - **Production Database:** On the Oracle Cloud VM, PostgreSQL is strictly bound to `127.0.0.1:5432`. Oracle Cloud Infrastructure (OCI) Security Lists and internal Ubuntu firewall rules (`iptables` / `ufw`) **block all external inbound traffic to port 5432**.
   - Your local machine cannot connect to the Oracle VM database unless you explicitly open an SSH port tunnel.

2. **CORS & Origin Safety:**
   - In `server/src/main.ts`, local ports (`http://localhost:4200`) are strictly restricted to local development environments and are excluded in production, ensuring cross-origin requests cannot bleed between environments.

3. **Discord Gateway Bot Token Tip:**
   - If your local `server/.env` uses the exact same `DISCORD_TOKEN` as production, both your local machine and your Oracle VM will connect to Discord's WebSocket Gateway simultaneously. Discord allows this, but both bots might respond to the same message or button click.
   - **Recommendation:** When testing Discord slash commands locally, either pause the production PM2 bot temporarily (`pm2 stop ryvl-bot`), or create a secondary test application on the Discord Developer Portal with its own test bot token.

---

## 2. Oracle Cloud Production Database Architecture

- **Operating System:** Ubuntu 22.04 / 24.04 LTS (Oracle Cloud Always Free Ampere A1 or E2 Micro)
- **Database Engine:** PostgreSQL 16
- **Connection URI (in `/opt/ryvl/ryvl-discord-bot/server/.env`):**
  ```env
  DATABASE_URL="postgresql://ryvl:your_secure_password@127.0.0.1:5432/ryvl?schema=public"
  ```

### Initial PostgreSQL Setup on the VM (if installing fresh)
```bash
sudo apt update && sudo apt install -y postgresql postgresql-contrib

# Switch to postgres user and create application role & database
sudo -u postgres psql <<EOF
CREATE USER ryvl WITH ENCRYPTED PASSWORD 'your_secure_password';
CREATE DATABASE ryvl OWNER ryvl;
GRANT ALL PRIVILEGES ON DATABASE ryvl TO ryvl;
\q
EOF
```

---

## 3. Applying Database Schema Migrations

Whenever new features (such as Club Tracking, Player Registrations, TOTW, or FC Draft Tournaments) are added, the Prisma schema must be synced on the Oracle VM:

```bash
# 1. SSH into your Oracle Cloud VM
ssh -i ~/.ssh/id_rsa ubuntu@your-oracle-vm-ip

# 2. Navigate to the server folder
cd /opt/ryvl/ryvl-discord-bot/server

# 3. Pull latest code (when ready)
git pull origin main

# 4. Generate the Prisma Client
npx prisma generate

# 5. Push schema updates to the production database
npx prisma db push

# 6. Rebuild the server
npm run build

# 7. Restart the PM2 process
pm2 restart ryvl-bot
```

### New Database Tables in This Release
| Table Name | Purpose |
| :--- | :--- |
| `ea_player_match_stats` | Stores individual Pro Clubs match statistics (goals, assists, passes, tackles, ratings, MOTM). |
| `registered_discord_players` | Maps Discord User IDs to EA Pro Clubs Gamertags per Discord guild. |
| `player_registration_audits` | Security and audit log of who linked or unlinked players. |
| `totw_configs` | Stores Team of the Week automation settings, channel IDs, and formation preferences. |
| `tournament_configs` | Default settings for FC Draft tournaments. |
| `tournament_instances` | Lifecycle, signups, brackets, and match results for FC Draft tournaments. |

---

## 4. Automated Backup & Recovery Strategy

To ensure zero data loss on Oracle Cloud, configure automated daily backups with rotation.

### A. Create Backup Directory & Script
```bash
sudo mkdir -p /opt/backups/postgres
sudo chown -R ubuntu:ubuntu /opt/backups

cat << 'EOF' > /opt/backups/backup_db.sh
#!/bin/bash
set -e

BACKUP_DIR="/opt/backups/postgres"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/ryvl_backup_${TIMESTAMP}.sql.gz"

# Dump and compress database
PGPASSWORD="your_secure_password" pg_dump -U ryvl -h 127.0.0.1 -d ryvl | gzip > "${BACKUP_FILE}"

# Keep only the last 14 days of backups
find "${BACKUP_DIR}" -type f -name "ryvl_backup_*.sql.gz" -mtime +14 -delete

echo "[$(date)] Backup completed successfully: ${BACKUP_FILE}"
EOF

chmod +x /opt/backups/backup_db.sh
```

### B. Configure Daily Cron Job
```bash
crontab -e
```
Add the following line to run every morning at 03:00 AM Romanian time:
```cron
0 3 * * * /opt/backups/backup_db.sh >> /opt/backups/backup.log 2>&1
```

### C. Restoring from a Backup
If you ever need to restore the database from a backup archive:
```bash
# 1. Stop PM2 service
pm2 stop ryvl-bot

# 2. Restore database from compressed dump
gunzip -c /opt/backups/postgres/ryvl_backup_YYYYMMDD_HHMMSS.sql.gz | PGPASSWORD="your_secure_password" psql -U ryvl -h 127.0.0.1 -d ryvl

# 3. Restart PM2 service
pm2 restart ryvl-bot
```

---

## 5. Multi-Domain & Subdomain Architecture

Caddy manages SSL certificates and serves the appropriate context based on the requested domain:

| Domain | Role | Target Route |
| :--- | :--- | :--- |
| `ryvl.top` & `www.ryvl.top` | Official RYVL Esports Team Website | Serves public shell (`/`, `/team`, `/about`, `/recruitment`, etc.) |
| `bot.ryvl.top` | Multi-Server Bot Management Console | Automatically routes `/` to `/admin/dashboard` |
| `/api/*` (both domains) | NestJS Backend API | Reverse proxied to `127.0.0.1:3000` |

---

## 6. Full Deployment Procedure (When Ready to Push)

> [!IMPORTANT]
> Do not execute `git push` from your local machine until you have reviewed and tested everything locally.

When you are ready to deploy:
```bash
# On your local machine (when authorized):
git add .
git commit -m "feat: multi-server isolation, player registrations, TOTW cards, and tournament bot"
git push origin main

# On the Oracle VM:
cd /opt/ryvl
git pull origin main

# Build Server
cd /opt/ryvl/ryvl-discord-bot/server
npm ci
npx prisma generate
npx prisma db push
npm run build

# Build Web (or copy dist)
cd /opt/ryvl/ryvl-discord-bot/web
npm ci
npm run build
sudo cp -r dist/web/* /var/www/ryvl/

# Restart Services
pm2 restart ryvl-bot
sudo systemctl reload caddy
```
