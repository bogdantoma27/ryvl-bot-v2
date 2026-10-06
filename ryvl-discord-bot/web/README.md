# RYVL web

Angular 22 app (standalone components, signals, Tailwind CSS 4) for the public site (`/`, `/match-center`, `/performance`, `/docs`, …) and the admin console (`/admin/...`). In production Caddy serves the built files and proxies `/api` to the NestJS backend on the same origin. See the repository README for features and deployment.

## Development

```bash
npm ci
npm start            # http://localhost:4200
```

On port 4200 the app calls the backend at `http://localhost:3000` (run `npm run start:dev` in `../server`, with `FRONTEND_URL=http://localhost:4200`). In a development build you can point it elsewhere with `localStorage.setItem('ryvl_api_url', 'http://host:port')`; production builds ignore that override.

## Checks

```bash
npm run build                 # production build into dist/web
npm test -- --watch=false     # Vitest unit specs (*.spec.ts)
```

`test/*.cjs` are browser smoke and regression scripts run by CI against the built app with stubbed API responses.
