# RYVL DS Bot

Stack-ul curent:

- backend: FastAPI + Discord bot + scheduler in [ryvl-bot/service](ryvl-bot/service)
- frontend: Angular admin panel in [ryvl-bot/webapp](ryvl-bot/webapp)
- deploy: Render Blueprint in [ryvl-bot/render.yaml](ryvl-bot/render.yaml)

## Ce face aplicatia

- login admin prin Discord OAuth (doar membri cu permisiunea Discord "Administrator")
- Events: create, vote, edit, reschedule, close, cancel, delete, drafturi, recurenta saptamanala
- Lineup: wizard cu editor de teren pe `<canvas>` (pozitionare pixel-perfect identica cu randarea server-side), drag-and-drop, drafturi, postare imagine in Discord (fara text duplicat pentru titlu/formatie/kickoff, acestea fiind deja in imagine)
- Account: profil, tema (light/dark/system); sign-out disponibil din meniul de profil al sidebar-ului

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

`DEFAULT_TIMEZONE` este doar valoarea implicita folosita la randare/afisare; nu exista o pagina de Settings separata — tema se configureaza din pagina Account.

Intervalul scheduler-ului este hardcodat in backend si este ales conservator pentru a evita presiunea inutila pe baza de date din tier-ul free Render.

Nu mai exista in backend: `APP_ENV`, `APP_NAME`, `ADMIN_ROLE_IDS`, `DEFAULT_ATTENDANCE_CHANNEL_ID`, `DEFAULT_LINEUP_CHANNEL_ID`, `SCHEDULER_INTERVAL_SECONDS` — toate au fost eliminate.

## Baza de date

Local:

1. SQLite (implicit) este ok.

Productie:

1. Foloseste un Postgres extern (ex. Supabase) si seteaza `DATABASE_URL` pe backend.
2. Nu folosi SQLite pentru persistenta in Render (containerul poate pierde datele la redeploy/restart).

## Deploy Render

Blueprint deja pregatit: [ryvl-bot/render.yaml](ryvl-bot/render.yaml)

### Ce creeaza blueprint-ul

1. Web Service backend: `ryvl-bot-api`.
2. Static Site frontend: `ryvl-bot-web`.

Blueprint-ul nu mai provizioneaza Render Postgres; `DATABASE_URL` trebuie setat manual catre un Postgres extern (ex. Supabase).

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
4. Dupa provisioning, setezi env vars obligatorii pe backend (inclusiv `DATABASE_URL` catre Postgres-ul extern).
5. Adaugi redirect-ul OAuth in Discord Developer Portal.
6. Dai deploy/redeploy si verifici:

	- health backend: `/healthz`
	- login OAuth din frontend
	- pagina Events + Lineup + Account

### Ce trebuie completat manual dupa creare

Copy-paste rapid (key = example value):

Backend (`ryvl-bot-api`) env vars:

```env
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME

ADMIN_APP_URL=https://YOUR_FRONTEND.onrender.com
PUBLIC_API_BASE_URL=https://YOUR_BACKEND.onrender.com

DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN
DISCORD_CLIENT_ID=YOUR_DISCORD_APP_CLIENT_ID
DISCORD_CLIENT_SECRET=YOUR_DISCORD_APP_CLIENT_SECRET
DISCORD_OAUTH_REDIRECT_URI=https://YOUR_BACKEND.onrender.com/api/auth/discord/callback
DISCORD_GUILD_ID=123456789012345678

SESSION_SECRET=GENERATED_BY_RENDER_OR_SET_MANUALLY
```

Frontend (`ryvl-bot-web`): nu necesita env vars — URL-ul backend-ului este o constanta stabilita la build (`PRODUCTION_API_BASE_URL` in [ryvl-bot/webapp/src/app/core/api.service.ts](ryvl-bot/webapp/src/app/core/api.service.ts)). Daca schimbi URL-ul backend-ului de productie, actualizezi constanta si redeploy frontend.

Discord OAuth Redirect (in Discord Developer Portal) trebuie sa fie exact:

```text
https://YOUR_BACKEND.onrender.com/api/auth/discord/callback
```
