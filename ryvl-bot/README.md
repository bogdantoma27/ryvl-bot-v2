# RYVL Bot

Backend-ul curent este in [service](service) si foloseste FastAPI, SQLAlchemy si discord.py.
Frontend-ul (admin panel) este in [webapp](webapp) si foloseste Angular (standalone components + signals).

## Ce este implementat

- login admin prin Discord OAuth2 + sesiune cookie; acces permis doar membrilor cu permisiunea Discord "Administrator" pe server
- Events: creare (wizard in 4 pasi), listare, editare, reprogramare, inchidere, anulare, stergere, drafturi salvate, recurenta saptamanala
- postare automata a evenimentelor in Discord (embed + butoane de vot) conform programarii (scheduler intern)
- Lineup: wizard in 4 pasi (detalii, plasare jucatori pe teren, conexiuni, review), drafturi salvate local, editor de teren pe `<canvas>` cu pozitionare exacta a pixelilor (identica cu randarea server-side), drag-and-drop din lista de membri direct pe pozitii
- postarea lineup-ului in Discord contine doar imaginea randata (titlu/formatie/kickoff sunt afisate in imagine, nu se mai duplica in text)
- bootstrap pentru UI-ul Angular (canale, roluri, membri, iconita/numele serverului)
- scheduler care publica evenimentele programate si inchide votarea cand ajunge la termen

## Run local

1. Deschide terminal in [service](service)
2. Creeaza venv si instaleaza dependintele:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
```

3. Porneste API-ul:

```powershell
python start.py
```

sau explicit:

```bash
uvicorn app.main:app --reload --port 8000
```

4. Pentru frontend, deschide terminal in [webapp](webapp):

```powershell
npm ci
npm start
```

Frontend local: `http://localhost:4200`. URL-ul backend-ului folosit de frontend este o constanta stabilita la build (`PRODUCTION_API_BASE_URL` in [api.service.ts](webapp/src/app/core/api.service.ts)).

## API utile

- `GET /healthz`
- `GET /docs`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/admin/bootstrap`
- `GET /api/admin/events/*`
- `GET /api/admin/lineup/formations`
- `POST /api/admin/lineup/render`
- `POST /api/admin/lineup/post`
- `POST /api/admin/lineup/send`

## Config

Sursa campurilor: [service/app/config.py](service/app/config.py). Nu mai exista `APP_ENV`, `APP_NAME`, `ADMIN_ROLE_IDS`, `DEFAULT_ATTENDANCE_CHANNEL_ID`, `DEFAULT_LINEUP_CHANNEL_ID` sau `SCHEDULER_INTERVAL_SECONDS` — au fost eliminate din backend.

- accesul de admin se acorda doar membrilor cu permisiunea Discord "Administrator" pe server (nu exista o lista separata de roluri permise).
- selectarea canalului pentru evenimente/lineup se face explicit din formular la fiecare creare, nu exista un canal default configurat din env.
- `DEFAULT_TIMEZONE` este doar valoarea implicita folosita la randare/afisare; nu se configureaza altfel din env in flow-ul curent.
- intervalul scheduler-ului este hardcodat in backend si nu se configureaza din env.

## Frontend (webapp)

- Angular standalone, semnale (`signal`/`computed`), fara NgModules.
- Titlul aplicatiei este "RYVL"; iconita din tab (`favicon`) este setata dinamic la iconita reala a serverului Discord (`bootstrap.guild_icon_url`), cu fallback static.
- Wizard-urile de creare event si lineup folosesc un stepper vertical (cercuri numerotate 1-4, conectate printr-o linie), nu taburi orizontale.
- Pasul de plasare a jucatorilor din lineup foloseste un `<canvas>` pe care se deseneaza exact aceleasi coordonate folosite de randarea server-side (`coords_by_formation`/`canvas_width`/`canvas_height` din `/api/admin/lineup/formations`), garantand alinierea pixel-perfect intre editor si imaginea postata.
- Nu mai exista paginile Diagnostics/Settings (boilerplate) — contul si tema se gestioneaza din pagina Account, iar sign-out este disponibil doar din meniul de profil din sidebar.

## Deploy

Blueprint-ul este in [render.yaml](render.yaml).

