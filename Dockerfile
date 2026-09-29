# syntax=docker/dockerfile:1

# ---- deps: install production dependencies only ----
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime ----
FROM node:26-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Must match the volume mount in docker-compose.yml (./data:/data).
ENV DATA_DIR=/data

# Production dependencies only.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
# Source is TypeScript, executed directly by Node's built-in type stripping.
COPY src ./src
COPY public ./public

# Writable data directory (SQLite + uploads), owned by the non-root user.
RUN mkdir -p /data && chown -R node:node /data

USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/health || exit 1

CMD ["node", "src/server.ts"]
