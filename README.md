![CodeGate Guardian](docs/image/codegate-guardian.png)

# CodeGate Guardian

CodeGate Guardian is an **AI Security Posture Management** and **AI Governance**
platform for engineering teams using AI coding tools.

It scans repositories and AI-tool configuration artifacts (skills, hooks, MCP
configs, IDE configs, rules, and agent instructions), converts findings into
structured security data, and presents report views for security and leadership
stakeholders.

## What This Platform Does

- Scans raw configuration content with `analyzeConfig`.
- Scans public GitHub repositories with `scanGithubRepo`.
- Detects `skills` automatically and applies skill-specific scanning flow.
- Stores normalized scan runs and findings in the database.
- Renders reporting focused on:
  - Asset coverage
  - Risk posture
  - Governance compliance
  - Ownership and accountability

## Scan Behavior

Repository scanning is intentionally deterministic:

1. Run repo scan first:
   `npx codegate-ai scan "<repo-or-path>" --force --format json --no-tui`
2. Detect skills in repository paths matching `*/skills/*/SKILL.md`.
3. If exactly one skill exists, auto-scan it with:
   `--skill <skill-name>`.
4. If multiple skills exist, return base findings and ask the user which skill
   to scan next (or `all`).

No `--deep` mode is used.

## Tech Stack

- Next.js App Router + React 19
- AI SDK for model/tool orchestration, calling Google Gemini directly
- CodeGate scanner (`codegate-ai`)
- Drizzle ORM + Postgres
- Auth.js session/auth foundation
- Object storage on the local filesystem or any S3-compatible endpoint
- Optional Redis for resumable streams and IP rate limiting

The stack is fully self-hosted: no managed platform, no vendor SDKs, and no
outbound calls beyond your database, your object store, and the model provider.

## Quick Start with Docker

The bundled stack runs the app, Postgres, Redis, and MinIO together. It is the
fastest way to a working instance and the reference for a production setup.

```bash
cp .env.example .env
# Set AUTH_SECRET and a Gemini key in .env:
#   openssl rand -base64 32
docker compose -f docker/docker-compose.yml up -d --build
```

The app is served at [http://localhost:3000](http://localhost:3000). MinIO's
console is at [http://localhost:9001](http://localhost:9001)
(`minioadmin` / `minioadmin`).

Migrations run automatically: a one-shot `migrate` service applies them before
the app starts, and the app waits for it to finish.

```bash
docker compose -f docker/docker-compose.yml logs -f app   # follow logs
docker compose -f docker/docker-compose.yml down          # stop
docker compose -f docker/docker-compose.yml down -v       # stop and drop data
```

Only `AUTH_SECRET` is mandatory — compose refuses to start without it. Add a
Gemini key to actually run scans through a model. Everything else has a working
default.

### Behind a reverse proxy

Set `APP_URL` to the public origin and have the proxy forward
`X-Forwarded-Proto` and `X-Forwarded-For`. The session cookie and the rate
limiter both read those headers, so TLS termination works without further
configuration.

## Prerequisites

Running with Docker needs only Docker with Compose v2. To develop against the
source you also need:

- Node.js 20+
- pnpm 10+
- A Postgres database

## Environment Variables

Copy `.env.example` to `.env.local` for local development, or to `.env` for the
Docker stack. Every variable is documented there; a variable set to an empty
string is treated as unset.

Required:

- `AUTH_SECRET` — session signing key (`openssl rand -base64 32`)
- `POSTGRES_URL`

Model provider (needed for any scan that calls a model):

- `GOOGLE_GENERATIVE_AI_API_KEY`, or `GEMINI_API_KEY`

Optional:

- `APP_URL` — public origin, used for page metadata and upload URLs
  (default `http://localhost:3000`)
- `REDIS_URL` — enables resumable streams and IP rate limiting
- `OBJECT_STORE_DRIVER` — `filesystem` (default) or `s3`
- `OBJECT_STORE_PATH` — where the filesystem driver writes
  (default `./data/uploads`)
- `S3_*` — endpoint, bucket, and credentials, required when the driver is `s3`
- `HACKATHON_MODE=true` — shared/global reporting view across guest sessions
- `ENABLE_LOCAL_CLI_MODELS=true` — expose locally installed CLI agents as models

## Local Development

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

App runs at [http://localhost:3000](http://localhost:3000). Uploads land in
`./data/uploads` and are served back at `/api/uploads`, so no object storage
service is needed for day-to-day work.

To run only the backing services in Docker and the app on the host:

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis
```

## Development Commands

- `pnpm dev` - start local dev server
- `pnpm build` - production build (migrations run separately)
- `pnpm start` - run production build output
- `pnpm check` - run code quality checks (`ultracite check`)
- `pnpm fix` - auto-fix style/lint issues (`ultracite fix`)
- `pnpm test` - run the full suite (unit, integration, E2E)
- `pnpm test:unit` - unit tests only
- `pnpm test:integration` - integration tests (requires Docker for testcontainers)
- `pnpm test:e2e` - Playwright E2E suite

Database utilities:

- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:studio`
- `pnpm db:push`
- `pnpm db:pull`
- `pnpm db:check`
- `pnpm db:up`

## Building the Image Directly

```bash
docker build -f docker/Dockerfile -t codegate-guardian .
docker run --rm -p 3000:3000 \
  -e AUTH_SECRET="$(openssl rand -base64 32)" \
  -e POSTGRES_URL="postgresql://user:pass@host:5432/db" \
  -e GOOGLE_GENERATIVE_AI_API_KEY="..." \
  -v guardian_uploads:/app/data/uploads \
  codegate-guardian
```

Apply migrations with the `migrate` target of the same Dockerfile:

```bash
docker build -f docker/Dockerfile --target migrate -t codegate-guardian-migrate .
docker run --rm -e POSTGRES_URL="postgresql://user:pass@host:5432/db" \
  codegate-guardian-migrate
```

## Model Routing Notes

- Default model is `google/gemini-2.5-pro`; `google/gemini-2.5-flash` is also
  available and is used for session titles.
- Models are called directly through `@ai-sdk/google`. Set
  `GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY`; without one, model calls
  fail with an explicit error rather than falling back to a hosted gateway.
- Setting `ENABLE_LOCAL_CLI_MODELS=true` additionally exposes locally installed
  `claude-code/*` and `codex/*` CLI agents as models.

## Project Intent

CodeGate Guardian is not a generic chatbot. The core deliverable is
**actionable AI security posture reporting** with scan evidence that maps to
governance outcomes and ownership decisions.
