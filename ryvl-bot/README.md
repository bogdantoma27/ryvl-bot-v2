# RYVL Bot

Backend-ul curent este in [service](service) si foloseste FastAPI, SQLAlchemy si discord.py.

## Ce este implementat

- login admin prin Discord OAuth2 + sesiune cookie
- attendance: create, list, vote, remove vote, reschedule, edit, close, cancel, delete
- attendance posts in Discord cu embed + butoane
- lineup: render preview, postare imagine si send in Discord
- settings persistate in DB pentru default timezone, channel-uri si roluri
- diagnostics si bootstrap pentru UI-ul Angular
- scheduler care inchide attendance cand ajung la termen

## Run local

1. Deschide terminal in [service](service)
2. Creeaza venv si instaleaza dependintele
3. Porneste API-ul:

```bash
uvicorn app.main:app --reload --port 8000
```

## API utile

- `GET /healthz`
- `GET /docs`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/admin/bootstrap`
- `GET /api/admin/settings`
- `GET /api/admin/diagnostics`

## Config

- `DEFAULT_TIMEZONE` nu mai este folosit ca default de aplicatie; valoarea se seteaza din Settings si se salveaza in baza de date.
- intervalul scheduler-ului este hardcodat in backend si nu se configureaza din env.
- `DEFAULT_ATTENDANCE_CHANNEL_ID` si `DEFAULT_LINEUP_CHANNEL_ID` raman defaults de runtime pentru selectarea canalelor.
- `ADMIN_ROLE_IDS` controleaza cine are acces la admin.

## Deploy

Blueprint-ul este in [render.yaml](render.yaml).
