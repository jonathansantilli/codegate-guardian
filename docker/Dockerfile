# syntax=docker/dockerfile:1.7
#
# Build context is the repository root:
#   docker build -f docker/Dockerfile .
#
# Targets:
#   runner  (default) — the application server
#   migrate           — one-shot container that applies database migrations

ARG NODE_VERSION=22-alpine

# --------------------------------------------------------------------------
# base — toolchain shared by every stage
# --------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
# Next.js' prebuilt binaries expect a glibc-compatible loader.
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# --------------------------------------------------------------------------
# deps — node_modules for the exact lockfile
# --------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# --------------------------------------------------------------------------
# builder — compiles the standalone server bundle
# --------------------------------------------------------------------------
FROM deps AS builder
COPY . .
# Placeholders so module-level env validation succeeds during the build. No
# connection is opened at build time (postgres-js connects lazily), and these
# values never reach the runtime image.
ENV AUTH_SECRET=build-time-placeholder-not-a-real-secret
ENV POSTGRES_URL=postgresql://build:build@127.0.0.1:5432/build
RUN pnpm build

# --------------------------------------------------------------------------
# migrate — one-shot migration runner
#
# Built from deps (not the standalone output) because drizzle-kit, tsx, and
# the SQL files in lib/db/migrations are all needed, and none of them are
# traced into the runtime bundle.
# --------------------------------------------------------------------------
FROM deps AS migrate
COPY . .
CMD ["pnpm", "db:migrate"]

# --------------------------------------------------------------------------
# runner — minimal production image
# --------------------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000
# Bind to every interface so the port is reachable from outside the container.
ENV HOSTNAME=0.0.0.0
# The scanner caches rules under $CODEGATE_HOME; keep it on a writable path.
ENV CODEGATE_HOME=/tmp/.codegate
ENV OBJECT_STORE_PATH=/app/data/uploads

# The scanner is spawned as `npx codegate-ai`, which never appears in an
# import graph and so is not traced into the standalone bundle. Installing it
# globally puts the binary on PATH, where npx finds it without touching the
# network at runtime. Keep this version in step with package.json.
RUN npm install -g codegate-ai@0.7.0 && npm cache clean --force

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Default upload location for OBJECT_STORE_DRIVER=filesystem. Mount a volume
# here to keep uploads across container replacements.
RUN mkdir -p /app/data/uploads && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000

# /ping is answered by the proxy before any auth check, so a healthy server
# returns 200 whether or not the caller holds a session.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
