# Stage 1: Build Angular frontend
FROM node:22-alpine AS web-build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# Stage 2: Build NestJS backend
FROM node:22-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ .
RUN npx prisma generate
RUN npm run build

# Stage 3: Production
FROM node:22-alpine AS production
WORKDIR /app

# Copy server build
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/node_modules ./node_modules
COPY --from=server-build /app/server/prisma ./prisma
COPY --from=server-build /app/server/package.json ./

# Copy frontend build
COPY --from=web-build /app/web/dist /app/web-static

EXPOSE 3000

# Run migrations then start
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main.js"]

