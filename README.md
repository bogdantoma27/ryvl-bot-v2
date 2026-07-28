# RYVL DS Bot

Stack-ul curent:

- backend: FastAPI + Discord bot + scheduler in [ryvl-bot/service](ryvl-bot/service)
- frontend: Angular admin panel in [ryvl-bot/webapp](ryvl-bot/webapp)
- deploy: Render Blueprint in [ryvl-bot/render.yaml](ryvl-bot/render.yaml)

## Ce face aplicatia

- login admin prin Discord OAuth
- attendance: create, vote, edit, reschedule, close, cancel, delete
- lineup: drag-and-drop, preview, postare imagine in Discord
- settings: default channel, admin roles, default timezone si roluri attendance
- diagnostics: stare aplicatie, DB, scheduler si Discord

## Setup local

### 4.1 Backend

```powershell
cd ryvl-bot/service
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
python start.py
```

Alternativ explicit (daca vrei sa fortezi alt host/port):

```powershell
set HOST=127.0.0.1
set PORT=8000
set RELOAD=true
python start.py
```

Health endpoint:

```text
http://127.0.0.1:8000/healthz
```

### 4.2 Frontend

```powershell
cd ryvl-bot/webapp
npm ci
npm start
```

Frontend local:

```text
http://localhost:4200
```

## Config backend

Sursa campurilor: [ryvl-bot/service/app/config.py](ryvl-bot/service/app/config.py)

Variabilele de productie (required + optional) sunt documentate canonical in sectiunea Deploy Render de mai jos.

`DEFAULT_TIMEZONE` nu mai este configurat din env pentru comportamentul de aplicatie; se seteaza din [Settings](ryvl-bot/webapp/src/app/features/pages/settings-page.component.ts) si se salveaza in baza de date.

Intervalul scheduler-ului este hardcodat in backend si este ales conservator pentru a evita presiunea inutila pe baza de date din tier-ul free Render.

## Baza de date

Local:

1. SQLite (implicit) este ok.

Productie:

1. Foloseste Render Postgres.
2. Nu folosi SQLite pentru persistenta in Render.

Motiv:

1. SQLite in container poate pierde datele la redeploy/restart.
2. Postgres este persistent si managed.

## Deploy Render

Blueprint deja pregatit: [ryvl-bot/render.yaml](ryvl-bot/render.yaml)

### Ce creeaza blueprint-ul

1. Web Service backend: `ryvl-bot-api`.
2. Static Site frontend: `ryvl-bot-web`.
3. Render Postgres: `ryvl-bot-db`.

### Cum il folosesti

1. Push codul in GitHub.
2. Render Dashboard -> New -> Blueprint.
3. Selectezi repository-ul.
4. Blueprint path:

```text
ryvl-bot/render.yaml
```

5. Confirmi crearea serviciilor.

### Checklist rapid (recomandat)

1. Push pe branch-ul dorit in GitHub.
2. Render -> New -> Blueprint -> selectezi repository-ul.
3. Blueprint path: `ryvl-bot/render.yaml`.
4. Dupa provisioning, setezi env vars obligatorii pe backend.
5. Setezi `NG_APP_API_BASE_URL` pe frontend cu URL-ul backend.
6. Adaugi redirect-ul OAuth in Discord Developer Portal.
7. Dai deploy/redeploy si verifici:

	- health backend: `/healthz`
	- login OAuth din frontend
	- pagina Attendance + Settings + Diagnostics

### Ce trebuie completat manual dupa creare

Copy-paste rapid (key = example value):

Backend (`ryvl-bot-api`) env vars:

```env
APP_ENV=production
APP_NAME=RYVL Bot API
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME

ADMIN_APP_URL=https://YOUR_FRONTEND.onrender.com
PUBLIC_API_BASE_URL=https://YOUR_BACKEND.onrender.com

DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN
DISCORD_CLIENT_ID=YOUR_DISCORD_APP_CLIENT_ID
DISCORD_CLIENT_SECRET=YOUR_DISCORD_APP_CLIENT_SECRET
DISCORD_OAUTH_REDIRECT_URI=https://YOUR_BACKEND.onrender.com/api/auth/discord/callback
DISCORD_GUILD_ID=123456789012345678

ADMIN_ROLE_IDS=111111111111111111,222222222222222222
DEFAULT_ATTENDANCE_CHANNEL_ID=333333333333333333
DEFAULT_LINEUP_CHANNEL_ID=444444444444444444

SCHEDULER_INTERVAL_SECONDS=30
SESSION_SECRET=GENERATED_BY_RENDER_OR_SET_MANUALLY
```

Frontend (`ryvl-bot-web`) env vars:

```env
NG_APP_API_BASE_URL=https://YOUR_BACKEND.onrender.com
```

Discord OAuth Redirect (in Discord Developer Portal) trebuie sa fie exact:

```text
https://YOUR_BACKEND.onrender.com/api/auth/discord/callback
```

Important:

1. Build-ul frontend genereaza [ryvl-bot/webapp/public/runtime-config.js](ryvl-bot/webapp/public/runtime-config.js) din `NG_APP_API_BASE_URL`.
2. Daca schimbi URL-ul backend, redeploy frontend.
