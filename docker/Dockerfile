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
# The front page is prerendered, so the waitlist form key has to be present
# now rather than at runtime. It is a public form id, not a secret — it ships
# in the HTML either way. Unset simply means the form is not rendered.
ARG WAITLIST_FORM_KEY=""
ENV WAITLIST_FORM_KEY=${WAITLIST_FORM_KEY}
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

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static


USER nextjs
EXPOSE 3000

# /ping is answered by the proxy before any auth check, so a healthy server
# returns 200 whether or not the caller holds a session.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
