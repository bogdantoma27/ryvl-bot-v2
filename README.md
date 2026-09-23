# RYVL Discord Bot

A Discord event/attendance bot with web dashboard. Users can RSVP to events with Yes/Tentative/No buttons.

## Features
- Event creation via Discord slash commands and web dashboard
- RSVP with Yes/Tentative/No buttons
- Recurring events (daily, weekly, biweekly, monthly, custom)
- Multi-server support
- Real-time dashboard with SSE updates
- Role-based event notifications

## Tech Stack
- **Backend**: NestJS (TypeScript) + discord.js
- **Frontend**: Angular 22 (standalone components, signals, Tailwind v4)
- **Database**: PostgreSQL + Prisma ORM
- **Hosting**: Oracle Cloud VM
- **Process manager**: PM2
- **Reverse proxy / static hosting**: Caddy
- **CI/CD**: GitHub Actions

## Production Deployment

The complete Oracle Cloud deployment and automatic GitHub Actions setup is documented in:

**[Oracle Cloud VM Deployment Guide](ORACLE_VM_DEPLOYMENT.md)**

It includes OCI networking, host firewall rules, Node.js 22, PM2, Caddy, backend/frontend deployment, environment variables, Discord OAuth, GitHub Actions secrets, automatic deployment and troubleshooting.

## Prerequisites
- Node.js 22+
- PostgreSQL 17+ or a compatible hosted PostgreSQL service
- A Discord Application with Bot Token

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/bogdantoma27/ryvl-bot-v2.git
cd ryvl-bot-v2/ryvl-discord-bot

# Install server dependencies
cd server
npm ci

# Install web dependencies
cd ../web
npm ci
```

### 2. Configure backend environment

```bash
cd ../server
cp .env.example .env
nano .env
```

Do not put real secrets into `.env.example`. The real `.env` file is ignored by Git.

See [Oracle Cloud VM Deployment Guide](ORACLE_VM_DEPLOYMENT.md#9-configure-the-backend-environment) for every production variable.

### 3. Set up Prisma

```bash
npx prisma generate
npx prisma db push
```

Do not use `--force-reset` against a production database unless data loss is explicitly intended.

### 4. Start development

Backend:

```bash
cd ryvl-discord-bot/server
npm run start:dev
```

Frontend:

```bash
cd ryvl-discord-bot/web
npm start
```

### 5. Discord Bot Setup

1. Open the Discord Developer Portal.
2. Create/select the application.
3. In **Bot**, copy the token into `DISCORD_TOKEN`.
4. In **OAuth2**, copy the Client ID and Client Secret.
5. Add the exact callback URI configured as `DISCORD_OAUTH_REDIRECT_URI`.
6. Invite the bot with the required bot/application-command scopes.

## Production architecture

```text
Internet
   |
   v
Caddy :80 / :443
   |
   +-- Angular frontend
   |
   +-- /api/* -> NestJS :3000
                     |
                     +-- Discord bot
                     +-- PostgreSQL / Prisma
```

The NestJS port is not intended to be publicly exposed.

## Project Structure

```text
.
├── .github/
│   └── workflows/
│       └── deploy-oracle.yml     # Automatic Oracle VM deployment
├── ORACLE_VM_DEPLOYMENT.md       # Full production deployment guide
├── README.md
└── ryvl-discord-bot/
    ├── Caddyfile                 # Frontend + API reverse proxy
    ├── Dockerfile
    ├── docker-compose.yml
    ├── nginx/
    ├── server/                   # NestJS backend + Discord bot
    │   ├── prisma/
    │   └── src/
    └── web/                      # Angular 22 frontend
        └── src/app/
```

## Automatic deployment

Pushes to `main` that modify the backend, frontend, Caddyfile or deployment workflow automatically trigger the Oracle VM deployment.

The GitHub Actions workflow:

```text
.github/workflows/deploy-oracle.yml
```

For setup details and required repository secrets, see the [deployment guide](ORACLE_VM_DEPLOYMENT.md#16-github-actions-automatic-deployment).
