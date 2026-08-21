# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# laratik-planner production image
# Multi-stage build → ~150 MB final image on Alpine.
# Used by both CI (build + push to GHCR) and the VPS (pull + recreate).
# Mirrors the laratik-social-platform / mavis-trader pattern in vps-ops.
# Note: pinned to pnpm 10.x because pnpm 11 uses node:sqlite (Node 22+).
# ─────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: deps ──────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ─── Stage 2: builder ───────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Drizzle Kit reads DATABASE_URL at generate time but never connects (it
# only inspects the local schema), so a placeholder URL is sufficient.
# The real URL is supplied at container runtime via docker-compose.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm db:generate && pnpm build

# ─── Migration runner ───────────────────────────────────────────────────────
# Kept separate from the runtime image so production migrations have the
# schema, migration journal, CLI runtime and exact lockfile dependencies.
FROM builder AS migrator
ENV NODE_ENV=production
CMD ["pnpm", "db:migrate"]

# ─── Stage 3: runner ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Brand-kit local-volume storage (see `src/lib/storage/`). Create
# the uploads dir at image build time and chown it to the runtime
# user so the `nextjs` user can read+write. A named volume
# (`laratik-planner-app-uploads` in `docker-compose.yml`) is then
# mounted over this empty dir, so the chown propagates to the
# mounted volume on first start.
RUN mkdir -p /data/uploads && chown -R nextjs:nodejs /data/uploads

# Static assets + standalone server
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Health check — Traefik + autoheal rely on this endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -q --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
