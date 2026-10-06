#!/usr/bin/env bash
# Applies the reviewed, idempotent schema upgrades in order. Run from anywhere with
# DATABASE_URL set. Every file must be safe to run repeatedly and must never drop data.
# To add a schema change: write a new prisma/deploy/<name>.sql and append it below.
set -euo pipefail
SERVER="$(cd "$(dirname "${BASH_SOURCE[0]}")/../server" && pwd)"
cd "$SERVER"
FILES=(
  vpg-notifications.sql
  stats-totw-tournaments.sql
  superliga-mvp.sql
  schema-catchup.sql
)
for f in "${FILES[@]}"; do
  echo "Applying prisma/deploy/$f"
  npx prisma db execute --schema prisma/schema.prisma --file "prisma/deploy/$f"
done
