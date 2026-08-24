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

RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs nextjs

# Brand-kit local-volume storage (see `src/lib/storage/`). Create
# the uploads dir at image build time and chown it to the runtime
# user so the `nextjs` user can read+write. A named volume
# (`laratik-planner-app-uploads` in `docker-compose.yml`) is then
# mounted over this empty dir, so the chown propagates to the
# mounted volume on first start.
RUN mkdir -p /data/uploads && chown -R 1001:1001 /data/uploads

# Static assets + standalone server
COPY --from=builder /app/public ./public
COPY --from=builder --chown=1001:1001 /app/.next/standalone ./
COPY --from=builder --chown=1001:1001 /app/.next/static ./.next/static

USER 1001
EXPOSE 3000

# Health check — Docker liveness only. Use the liveness probe so a
# transient DB hiccup does NOT cause autoheal to restart the container
# (a restart does not fix DB connectivity and just churns the process).
# Readiness (DB + schema check) lives at /api/health/ready, which
# Traefik and the deploy gate probe separately. See
# docs/testing/strategy.md (Release gates) for the full contract.
# Exec form (DL3025): `wget --spider` already returns non-zero on any
# 4xx/5xx/network failure, so the trailing `|| exit 1` is unneeded.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["wget", "-q", "--spider", "http://127.0.0.1:3000/api/health/live"]

CMD ["node", "server.js"]
