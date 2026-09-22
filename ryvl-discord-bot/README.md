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
- **Hosting**: Oracle Cloud Free Tier (recommended)

## Prerequisites
- Node.js 22+
- PostgreSQL 17+
- A Discord Application with Bot Token

## Quick Start

### 1. Clone and install
```bash
# Install server dependencies
cd server && npm install

# Install web dependencies
cd ../web && npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your Discord bot token and database credentials
```

### 3. Set up database
```bash
# Start PostgreSQL (via Docker)
docker compose up db -d

# Run migrations
cd server && npx prisma db push
```

### 4. Start development
```bash
# Terminal 1: Start backend
cd server && npm run start:dev

# Terminal 2: Start frontend
cd web && npm start
```

### 5. Discord Bot Setup
1. Go to https://discord.com/developers/applications
2. Create a New Application
3. Go to Bot tab, copy the Token → paste in .env as DISCORD_TOKEN
4. Go to OAuth2 tab, copy Client ID and Client Secret → paste in .env
5. Set redirect URI to your callback URL
6. Invite the bot: `https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147485696&scope=bot%20applications.commands`

## Docker Deployment
```bash
docker compose up -d
```

## Project Structure
```
├── server/          # NestJS backend + Discord bot
│   ├── src/
│   │   ├── auth/    # Discord OAuth2 + JWT
│   │   ├── discord/ # Bot commands & interactions
│   │   ├── events/  # Event CRUD + recurrence
│   │   ├── guilds/  # Multi-server management
│   │   └── scheduler/ # Auto-publish & close
│   └── prisma/      # Database schema
├── web/             # Angular 22 frontend
│   └── src/app/
│       ├── core/    # Services & guards
│       └── features/ # Page components
├── nginx/           # Reverse proxy config
├── docker-compose.yml
└── Dockerfile
```
