# Stage 1: Build NestJS backend
FROM node:22-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ .
RUN npx prisma generate
RUN npm run build

# Stage 2: Production
FROM node:22-alpine AS production
WORKDIR /app

# Copy server build & dependencies
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/node_modules ./node_modules
COPY --from=server-build /app/server/prisma ./prisma
COPY --from=server-build /app/server/package.json ./

EXPOSE 3000

# Run migrations then start
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main.js"]
