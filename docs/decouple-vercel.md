# Decouple CodeGate Guardian from Vercel

Architecture and execution plan for removing every Vercel dependency and
restructuring the codebase into a proper layered, hexagonal design with
pluggable infrastructure.

> **Revision note:** this version (v2) folds in findings from the audit at
> `docs/decouple-vercel-findings.md` (or internal review on the same date).
> Substantive changes since v1: phase ordering swapped so LLM port lands
> before use cases; persistence phase split in three; feature preservation
> table expanded with ~20 previously missing items; ports added
> (`PasswordHasher`, `ProcessRunner`, `GitClient`, `Logger`, `ChatEventSink`);
> `TitleGenerator` removed; in-memory repository demoted from first-class
> adapter to test fake; data-loss-is-accepted policy made explicit; exit
> criteria strengthened.

---

## Table of contents

1. [Objectives & non-goals](#1-objectives--non-goals)
2. [Target architecture](#2-target-architecture)
3. [Development practices](#3-development-practices)
4. [Feature preservation contract](#4-feature-preservation-contract)
5. [Port catalog](#5-port-catalog)
6. [Phased execution](#6-phased-execution)
7. [CI/CD](#7-cicd)
8. [Risks & mitigations](#8-risks--mitigations)
9. [Exit criteria](#9-exit-criteria)
10. [Glossary](#10-glossary)

---

## 1. Objectives & non-goals

### Objectives

- Remove every Vercel dependency (runtime packages, SaaS calls, deploy
  metadata, Vercel-specific Next.js config fields).
- Restructure the codebase into domain / application / infrastructure
  layers.
- Turn infrastructure concerns (database, object store, LLM, telemetry,
  logger, bot detection, rate limiter, upload, scanner CLI, subprocess
  execution, git client, password hashing, request context, streaming sink)
  into ports with pluggable adapters.
- Preserve 100% of current user-visible functionality.
- Apply disciplined engineering: TDD for all new code, BDD-style acceptance
  tests for every feature in §4, enforced by CI.
- Ship a `docker compose up` path that brings the whole stack up locally
  with no cloud dependencies.

### Non-goals

- Feature additions, UI redesign, or behavioral changes (beyond a handful
  of explicit acceptances below).
- Backward compatibility with existing Vercel Blob URLs, Vercel OIDC flows,
  Vercel-emitted headers, or `vercel.json` metadata.
- Continuing to support "run on Vercel" as a first-class target (it may
  still work incidentally; it will not be tested, documented, or
  supported).
- Support for multiple simultaneous databases in a single process. "Plug
  and play" means choice of one at boot time via configuration, not
  runtime multi-tenancy.
- Preserving the transitive presence of `@ai-sdk/gateway` in
  `pnpm-lock.yaml` (it is pulled in by `ai` and we do not fork `ai`).

### Explicit acceptances (behavior we are knowingly breaking)

These are stated up front so reviewers can object early.

- **A1 — Vercel Blob URLs in existing DB rows become stranded.** The plan
  declares data-loss acceptable: any `Message_v2.attachments` or
  `Document.content` entries that embed
  `https://*.public.blob.vercel-storage.com/...` URLs will no longer
  resolve after the migration. Operators choosing to preserve the data
  must run their own one-time rewrite; we do not ship one.
- **A2 — Geolocation signal dropped.** `geolocation(request)` in the chat
  prompt is cosmetic (adds city/country to system prompt). We remove it.
- **A3 — Attachment response shape changes.** The upload route currently
  returns Vercel Blob's response shape; the new S3 adapter returns our
  own `{ url, key, contentType, size }`. Every frontend consumer
  (`PreviewAttachment`, `document-preview`, etc.) is updated in the same
  PR as the adapter.
- **A4 — `IS_DEMO=1` / `basePath` / `assetPrefix` behavior is preserved
  but re-homed.** Current `next.config.ts:4-19` logic stays functional;
  the env var graduates into the zod-parsed `Env` schema so demo mode is
  a documented, tested configuration rather than an accident.
- **A5 — Resumable streams require Redis to function.** Without
  `REDIS_URL`, chat still works but cannot be resumed after reconnect —
  matching current behavior. We document this, not silently degrade.

---

## 2. Target architecture

### 2.1 Layering

Classic hexagonal (ports and adapters) with three concentric layers.

```
┌───────────────────────────────────────────────────────┐
│  Infrastructure (adapters, frameworks, I/O)           │
│  - HTTP routes (Next.js)                              │
│  - Edge middleware (proxy.ts)                         │
│  - React components                                   │
│  - Persistence adapters (Drizzle-Postgres)            │
│  - External adapters (S3, OTLP, LLM SDKs, redis, …)   │
│  - Composition root                                   │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Application (use cases, ports)                 │  │
│  │  - Orchestrates domain objects                  │  │
│  │  - Defines port interfaces                      │  │
│  │  - No framework or I/O imports                  │  │
│  │                                                 │  │
│  │  ┌───────────────────────────────────────────┐  │  │
│  │  │  Domain (entities, values, policies)      │  │  │
│  │  │  - Pure TypeScript                        │  │  │
│  │  │  - Zero external imports                  │  │  │
│  │  │  - Expresses invariants and rules         │  │  │
│  │  └───────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

**Dependency rule:** inner layers never import from outer layers. The
domain imports nothing outside itself. The application imports only the
domain and its own ports. The infrastructure imports everything but is
imported by nothing outside the composition root.

### 2.2 Directory layout

```
app/                          # Next.js App Router — HTTP/UI adapter
proxy.ts                      # Next.js middleware — HTTP/UI adapter
components/                   # React components — UI adapter
hooks/                        # React hooks

src/
  domain/
    chat/
      entities/
        chat.ts
        message.ts
      value-objects/
        chat-id.ts
        visibility.ts
      policies/
        chat-access.ts
    scan/
      entities/
        scan-run.ts
        finding.ts
      value-objects/
        severity.ts
        owasp-category.ts
      policies/
        finding-deduplication.ts
      services/
        report-normalization.ts      # moved from lib/security/
        report-score-semantics.ts    # moved from lib/security/
    user/
      entities/user.ts
      value-objects/email.ts
    artifact/
      entities/
        document.ts
        suggestion.ts
        vote.ts
      value-objects/artifact-kind.ts
    reporting/
      services/
        reporting-overview.ts
        finding-detail.ts
        github-source-link.ts
        shell-view.ts
        scan-report-view.ts
    errors.ts                 # domain error hierarchy

  application/
    ports/
      persistence/
        user-repository.ts
        chat-repository.ts
        message-repository.ts
        scan-run-repository.ts
        scan-finding-repository.ts
        document-repository.ts
        suggestion-repository.ts
        vote-repository.ts
        stream-repository.ts
        unit-of-work.ts
      object-store.ts
      bot-detection.ts
      rate-limiter.ts
      request-context.ts
      telemetry.ts
      logger.ts
      llm-provider.ts
      scanner.ts
      process-runner.ts
      git-client.ts
      password-hasher.ts
      chat-event-sink.ts
      clock.ts
      id-generator.ts
    use-cases/
      chat/
        send-message.ts
        continue-approved-tool-call.ts
        list-chats.ts
        delete-chat.ts
        delete-all-chats-for-user.ts
        get-chat.ts
        update-chat-visibility.ts
        update-chat-title.ts
        vote-message.ts
        delete-messages-after-timestamp.ts
      scan/
        analyze-config.ts
        scan-github-repo.ts
        sync-scan-reports.ts
      auth/
        authenticate-user.ts
        register-user.ts
        create-guest-user.ts
      reporting/
        get-overview.ts
        get-finding-detail.ts
      artifacts/
        save-document.ts
        update-document.ts
        update-document-content.ts
        list-document-versions.ts
        delete-document-versions-after.ts
        save-suggestions.ts
        list-suggestions.ts
      uploads/
        upload-attachment.ts
      streams/
        register-resumable-stream.ts
        list-stream-ids.ts
      system/
        ping.ts
    services/
      message-stream-orchestrator.ts
      error-presenter.ts              # maps domain errors to HTTP status

  infrastructure/
    persistence/
      drizzle-postgres/
        client.ts
        schema.ts
        migrations/
        repositories/…
    object-store/
      s3/
      filesystem/
    llm/
      google-gemini/
      claude-code-local/              # moved from lib/ai/providers/
      codex-local/                    # moved from lib/ai/providers/
      registry.ts                     # static ChatModel + capability map
      local-models-config.ts          # moved from lib/ai/
      ai-sdk-tools/                   # AI SDK tool() wrappers delegating
                                      #   to application use cases
    rate-limiter/
      redis/
    bot-detection/
      noop/
    request-context/
      http-headers/
    telemetry/
      otlp/
      noop/
    logger/
      console/
      otel/                           # optional: pipes through telemetry
    scanner/
      codegate-cli/
    process-runner/
      node-child-process/
    git-client/
      isomorphic-git/
    password-hasher/
      bcrypt-ts/
    chat-event-sink/
      ai-sdk-stream-writer/           # wraps UIMessageStreamWriter
    auth/
      next-auth/
    http/
      error-mapping.ts                # ChatbotError → Response
    middleware/
      proxy-adapter.ts                # thin wrapper used by root proxy.ts
    composition/
      container.ts
      env.ts

  presentation/                       # Optional; presenters/view-models

  shared/
    result.ts
    uuid.ts

tests/
  unit/                               # Domain + application unit tests
  fakes/                              # In-memory repository + port fakes
                                      #   (test-only, NOT first-class
                                      #   adapters)
  integration/                        # Per-adapter tests against real
                                      #   services via testcontainers
  e2e/                                # Playwright
  fixtures/
  helpers/

docker/
  Dockerfile
  docker-compose.yml                  # full local stack
  docker-compose.ci.yml               # variant used by CI
```

Notes on the revision:

- `presentation/` is optional and stays empty until a presenter is
  actually needed. React components remain in `components/`.
- `tests/fakes/` replaces the earlier idea of "in-memory adapters" as a
  first-class infrastructure implementation. In-memory repos are
  test-only fakes that implement the port enough to drive use-case unit
  tests — they make no claim to semantic equivalence with Postgres.
- `middleware/proxy.ts-adapter.ts` exists because Next.js middleware must
  live at the repo root (`proxy.ts`); the root file becomes a thin
  re-export.
- `ai-sdk-tools/` holds AI-SDK `tool()` definitions that call into
  application use cases. This keeps tool-call plumbing (input schemas,
  streaming) in the infrastructure layer where the AI SDK lives.

### 2.3 Composition root

All wiring happens in `src/infrastructure/composition/container.ts`:

```ts
export type ApplicationContainer = {
  useCases: { /* one per file in application/use-cases/ */ };
  ports: {
    objectStore: ObjectStore;
    botDetection: BotDetection;
    telemetry: Telemetry;
    logger: Logger;
    /* … as needed by routes */
  };
  shutdown: () => Promise<void>;
};

export function buildContainer(env: Env): ApplicationContainer { … }
```

- Called once per process at boot via `instrumentation.ts` and cached in
  a module-scoped singleton. HMR in dev resets it via
  `container.shutdown()`.
- Adapter selection driven by env (e.g. `OBJECT_STORE_DRIVER=s3`).
- HTTP route handlers, server actions, middleware, and tool executors
  call `getContainer().useCases.xyz(input)` only; they never import
  adapters directly and never import `drizzle-orm`.

### 2.4 Dependency graph enforcement

- Biome restricted-imports rules block:
  - `src/domain/**` from importing anything outside `src/domain/**`.
  - `src/application/**` from importing `src/infrastructure/**`.
  - `src/infrastructure/**` from importing `app/**` or `components/**`.
  - `app/**`, `components/**`, `proxy.ts` from importing
    `src/infrastructure/**` except the composition container entry
    point.
  - Any file from importing `@vercel/*`, `botid`, or calling
    `ai-gateway.vercel.sh`.
- Rules live in `biome.jsonc` and are enforced in CI via `pnpm check`.

---

## 3. Development practices

### 3.1 TDD — red, green, refactor

Applied at **two levels**:

1. **Domain and application code:** test-first, no exceptions.
   - Write a failing unit test in `tests/unit/…`.
   - Write the implementation using port fakes from `tests/fakes/`.
   - Refactor.
   - Add edge-case tests until branch coverage per use case is ≥95%.
2. **Adapters:** test-first at the **integration** level.
   - Write a failing integration test in `tests/integration/…` that
     exercises the real external service (postgres via testcontainers,
     MinIO, redis).
   - Implement the adapter against the port.
   - Refactor.
   - Unit tests for pure helpers inside the adapter (query builders, URL
     signers, JSON parsers) are welcome but not a substitute for the
     integration test.

**Rule:** an adapter is not considered implemented until its integration
test passes against a real dependency.

**What adapter equivalence testing does and does not mean.** The
persistence ports have one real adapter (`drizzle-postgres`) and one
test fake (`tests/fakes/persistence/*`). There is **no contract test
asserting behavioral equivalence** between them — that promise would be
unachievable given pg-specific semantics (`RETURNING`, composite PKs,
unique-constraint error codes, transaction isolation) and would either
reduce the real adapter to fake-compatible subset or bloat the fake into
a reimplementation of Postgres. Fakes exist to drive use-case tests;
adapter tests prove the adapter works against real Postgres.

### 3.2 BDD — scenarios as acceptance criteria

Each feature in §4 gets a BDD-style scenario set expressed as descriptive
Playwright (or integration) test blocks:

```ts
test.describe("Feature: Multi-turn chat with streaming responses", () => {
  test("Given an authenticated user, when they send a message, then the assistant reply streams to the UI", …);
  test("Given multiple models configured, when the user switches model mid-conversation, then the new model handles the next turn", …);
  test("Given the assistant invokes scanGithubRepo, then the scan run and findings persist to the database", …);
});
```

The §4 feature table is the contract. No feature ships without at least
one scenario. Phase 1 produces the full scenario set before any
restructuring begins.

### 3.3 Separation of concerns — layering rules

- **Domain** is pure: no `fs`, no `fetch`, no `next`, no `react`, no
  env, no `Date.now()`, no `crypto.randomUUID()`. Domain takes `Clock`
  and `IdGenerator` as explicit dependencies.
- **Application** owns ports and orchestrates. Imports domain.
  Does not import frameworks. Does not know HTTP or React.
- **Infrastructure** knows the world. Only infrastructure imports
  `drizzle-orm`, `@aws-sdk/*`, `next`, React, `postgres`, `redis`,
  `@anthropic-ai/claude-agent-sdk`, AI SDK adapters.
- **Presentation layer** (React + Next.js routes + `proxy.ts`) is
  infrastructure. It calls the container's use cases and translates
  results to HTTP/JSX.

### 3.4 Test pyramid

| Level | Runner | Count (target) | Runs in CI |
|---|---|---|---|
| Unit (domain + application) | `node:test` | Hundreds | Every push |
| Integration (adapters) | `node:test` + testcontainers | Tens | Every push |
| E2E (full stack) | Playwright against `docker-compose.ci.yml` | ≥59 scenarios (one per §4 feature); a thinner "smoke" subset (~30) runs on every push, full set nightly | Every push (smoke) + nightly (full) |

### 3.5 Tooling

- **Unit/integration test runner:** `node:test`, invoked via
  `tsx --test`. The existing `pnpm test` script (Playwright) is split
  into `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`, and a
  top-level `pnpm test` that runs all three in order.
- **Coverage:** `c8` wraps `node:test`; branch-coverage gate in CI
  (≥95% domain + application; adapters excluded since they are
  integration-covered).
- **Testcontainers:** `@testcontainers/postgresql`,
  `@testcontainers/redis`, a MinIO wrapper on `GenericContainer`.
  Container strategy: **one container per test file, not per test** —
  `beforeAll` boots the container, `beforeEach` truncates tables for
  persistence tests. Shared containers across an entire suite add
  cross-file coupling we don't want.
- **E2E runner:** Playwright.
- **Env parsing:** `zod` schema in
  `src/infrastructure/composition/env.ts`. Fails fast at boot.
- **Linting:** Biome + restricted-imports rules.
- **Type checking:** `tsc --noEmit` in CI.

---

## 4. Feature preservation contract

Every feature below continues to work exactly as today unless marked with
an acceptance tag (A1–A5). Each item has at least one BDD scenario.
Target locations are the post-refactor paths.

### Chat & messaging

| # | Feature | Current location | Target location |
|---|---|---|---|
| 1 | Send message, stream assistant reply | `app/(chat)/api/chat/route.ts` | Use case `send-message` + `message-stream-orchestrator` |
| 2 | Tool approval / deny replay | `route.ts:108-165` (branch on `messages` array + `approval-responded` / `output-denied` parts) | Use case `continue-approved-tool-call` |
| 3 | Resumable stream (when Redis is present) | `route.ts:56,325-344` + `resumable-stream` | `send-message` calls `StreamRepository.registerResumable(...)` |
| 4 | Resumable stream bootstrap endpoint (204) | `app/(chat)/api/chat/[id]/stream/route.ts` | Route stays; trivial |
| 5 | Client drop + reconnect | `resumable-stream` + `REDIS_URL` + SSE | Integration-tested under `docker-compose.ci.yml` |
| 6 | `data-chat-title` stream event | `route.ts:249-253` | `send-message` emits via `ChatEventSink` |
| 7 | Chat title autogeneration | `generateTitleFromUserMessage` in `actions.ts` | Called from `send-message` using the `LlmProvider` port directly (no dedicated `TitleGenerator`) |
| 8 | Per-user hourly message cap | `entitlements.ts` + `getMessageCountByUserId` | Enforced in `send-message` via `MessageRepository.countSince(...)` |
| 9 | Per-IP rate limit | `lib/ratelimit.ts` | Use case `send-message` calls `RateLimiter` port |
| 10 | List chats with cursor pagination | `getChatsByUserId` | Use case `list-chats`. **Preserves current tie behavior on `createdAt`** (no secondary `id` sort) unless a scenario mandates otherwise. |
| 11 | Delete chat (cascades vote/message/stream) | `deleteChatById` | Use case `delete-chat` using `UnitOfWork` |
| 12 | Delete all chats for user | `deleteAllChatsByUserId` | Use case `delete-all-chats-for-user` |
| 13 | Update chat visibility | `updateChatVisibilityById` | Use case `update-chat-visibility` |
| 14 | Update chat title (manual) | `updateChatTitleById` | Use case `update-chat-title` |
| 15 | Message voting | `voteMessage`, `getVotesByChatId` | Use case `vote-message` |
| 16 | Edit / retry (delete messages after timestamp) | `deleteMessagesByChatIdAfterTimestamp` | Use case `delete-messages-after-timestamp` |
| 17 | Slash commands | `components/chat/slash-commands.tsx` | Client-only; no port |
| 18 | Visibility selector | `components/chat/visibility-selector.tsx` + `update-chat-visibility` use case | UI adapter |
| 19 | Suggested actions | `components/chat/suggested-actions.tsx` | UI adapter |
| 20 | Sidebar toggle persistence | `components/ui/sidebar.tsx` + `defaultOpen` cookie | UI adapter; cookie handling stays |
| 21 | Sidebar history pagination | `/api/history` + `list-chats` | Route adapter |

### Scan & reporting

| # | Feature | Current location | Target location |
|---|---|---|---|
| 22 | Tool: `analyzeConfig` | `lib/ai/tools/analyze-config.ts` | Use case `analyze-config`, adapter `scanner/codegate-cli` |
| 23 | Tool: `scanGithubRepo` with skill detection and selection | `lib/ai/tools/scan-github-repo.ts` | Use case `scan-github-repo` + ports `Scanner`, `GitClient` |
| 24 | Scan run + finding persistence | `syncScanReportsForMessages` | Use case `sync-scan-reports` using `UnitOfWork` |
| 25 | Reporting overview | `/api/report` | Use case `get-overview` |
| 26 | Finding detail | `/api/report/finding` | Use case `get-finding-detail` |
| 27 | Hackathon mode (global reports) | `lib/security/hackathon-mode.ts` + `HACKATHON_MODE` env | Env flag read by `get-overview` |
| 28 | `/scan` page | `app/(chat)/scan/page.tsx` | Route adapter (currently a stub; preserved as-is) |
| 29 | Scan report view | `lib/security/scan-report-view.ts`, `components/scan/*` | Domain service + React presenter |
| 30 | GitHub source link | `lib/security/github-source-link.ts` | Domain service (pure) |
| 31 | Shell view | `lib/security/shell-view.ts`, `components/chat/shell.tsx` | Domain service + presenter |

### Artifacts & documents

| # | Feature | Current location | Target location |
|---|---|---|---|
| 32 | Artifact documents — text kind | `artifacts/text/server.ts` | Use case `save-document` / `update-document` (kind = text) |
| 33 | Artifact documents — code kind | `artifacts/code/server.ts` | Use case `save-document` (kind = code) |
| 34 | Artifact documents — sheet kind | `artifacts/sheet/server.ts` | Use case `save-document` (kind = sheet) |
| 35 | Artifact documents — image kind | `artifacts/image/client.tsx` only; **no server handler exists today** | Mark as dead code and delete in Phase 13 unless a scenario proves live use |
| 36 | Document streaming context (ProseMirror) | `data-stream-provider.tsx` + `data-stream-handler.tsx` | UI adapter consuming `ChatEventSink` events |
| 37 | Save document | `saveDocument` | Use case `save-document` |
| 38 | Update document content | `updateDocumentContent` | Use case `update-document-content` |
| 39 | List document versions | `getDocumentsById` | Use case `list-document-versions` |
| 40 | Delete document versions after timestamp | `deleteDocumentsByIdAfterTimestamp` | Use case `delete-document-versions-after` |
| 41 | Save suggestions | `saveSuggestions` | Use case `save-suggestions` |
| 42 | List suggestions | `getSuggestionsByDocumentId` | Use case `list-suggestions` |
| 43 | Document API route | `/api/document` | Route adapter |
| 44 | Suggestions API route | `/api/suggestions` | Route adapter |

### Auth, identity, files

| # | Feature | Current location | Target location |
|---|---|---|---|
| 45 | Email/password login | `app/(auth)/actions.ts` + `queries.getUser` | Use case `authenticate-user`, ports `UserRepository` + `PasswordHasher` |
| 46 | User registration | `app/(auth)/actions.ts:createUser` | Use case `register-user` |
| 47 | Guest user auto-provision | `app/(auth)/auth.ts` | Use case `create-guest-user` |
| 48 | Middleware: guest redirect / `/login` / `/register` / `/ping` | `proxy.ts` | Thin adapter delegating to auth use cases |
| 49 | File upload (images ≤5MB JPEG/PNG) | `/api/files/upload` | Use case `upload-attachment` + adapter `object-store/s3`. **A3:** response shape changes |
| 50 | Stored blob URLs already in DB | `Message_v2.attachments`, `Document.content` | **A1:** stranded after migration |

### Models, capabilities, telemetry, API

| # | Feature | Current location | Target location |
|---|---|---|---|
| 51 | Model selector & capabilities | `lib/ai/models.ts`, `/api/models` | `llm/registry.ts` (static map). Gateway-only models removed |
| 52 | Direct Gemini provider | `lib/ai/providers.ts` | Adapter `llm/google-gemini` |
| 53 | Local CLI models (Claude Code, Codex) | `lib/ai/providers/*.ts` + `lib/ai/local-models-config.ts` | Adapters `llm/claude-code-local`, `llm/codex-local` |
| 54 | `getWeather` tool | `lib/ai/tools/get-weather.ts` | Adapter `llm/ai-sdk-tools/get-weather.ts` (pure); no use case |
| 55 | `ChatbotError` → HTTP mapping | `lib/errors.ts` + each route's `.toResponse()` | Application service `error-presenter` + `http/error-mapping.ts` |
| 56 | Theme handling | `components/theme-provider.tsx`, `theme-color-sync.tsx`, `lib/theme-color.ts` | UI adapter (unchanged behavior) |
| 57 | `/api/messages` | `/api/messages/route.ts` | Route adapter |
| 58 | `/api/history` | `/api/history/route.ts` | Route adapter |
| 59 | `/api/vote` | `/api/vote/route.ts` | Route adapter |

### Preservation verification

The existing Playwright suite under `tests/` must pass against the new
architecture before each phase is considered complete. If a scenario is
missing for any row above, it is written in Phase 1 before any
restructuring begins.

---

## 5. Port catalog

One port per capability, defined as a TypeScript interface in
`src/application/ports/*.ts`. Each bullet lists: port name,
responsibility, adapters.

### Persistence ports

- `UserRepository` — CRUD for users; lookup by email/id. Password hashing
  is **not** a responsibility of this port (see `PasswordHasher`).
- `ChatRepository` — CRUD + cursor-paginated list + visibility updates +
  title updates.
- `MessageRepository` — append, update, list by chat, count since
  timestamp, delete after timestamp.
- `ScanRunRepository` — upsert by `(messageId, toolCallId)`, fetch by
  message ids.
- `ScanFindingRepository` — bulk insert under a scan run.
- `VoteRepository` — upsert, list by chat.
- `DocumentRepository` — save, update content, list versions, delete
  after timestamp.
- `SuggestionRepository` — save, list by document.
- `StreamRepository` — register a stream id under a chat, list stream
  ids for a chat.
- `UnitOfWork` — `run(fn)` wraps an atomic transaction. Drizzle adapter
  uses `db.transaction`. Use cases that touch multiple tables (`delete-
  chat`, `sync-scan-reports`) use this port.

All persistence ports are implemented by one adapter:
`drizzle-postgres`. In-memory fakes live in `tests/fakes/` and exist
only to drive use-case unit tests.

### Runtime ports

- `ObjectStore` — `put({ key, body, contentType })` → `{ url, key, size,
  contentType }`; `sign({ key, ttlSeconds })` → URL. Adapters: `s3`
  (MinIO/S3/R2), `filesystem` (dev fallback, writes under
  `./data/uploads` and is served via a route), `in-memory` fake in
  `tests/fakes/`.
- `BotDetection` — `verify(request)` → `{ ok: true }` or structured
  rejection. Adapters: `noop` (default). `turnstile` is left for a
  future adapter; not built in this plan.
- `RateLimiter` — `check({ key, limit, windowSeconds })` →
  `{ allowed: boolean, remaining, resetAt }`. Adapter: `redis`.
  Fake in `tests/fakes/`.
- `RequestContext` — `extract(request)` → `{ ip, userAgent }`. Adapter:
  `http-headers` (parses `x-forwarded-for`, `x-real-ip`, `user-agent`).
- `Telemetry` — spans + counters only: `startSpan`, `recordError`,
  `counter`. Does NOT include logging. Adapters: `otlp`, `noop`.
- `Logger` — `debug/info/warn/error(msg, attrs?)`. Split from
  `Telemetry` per audit. Adapters: `console` (default), `otel` (pipes
  through telemetry when both are enabled).
- `LlmProvider` — `createLanguageModel(modelId)` → `LanguageModelV2`.
  Adapters: `google-gemini`, `claude-code-local`, `codex-local`.
  Registered through a static registry module (no runtime fetches).
- `ChatEventSink` — emit UI-bound events during a `send-message` stream
  (`data-chat-title`, partial message parts, tool progress). Adapter:
  `ai-sdk-stream-writer` wrapping `UIMessageStreamWriter`. This is the
  outward-facing sibling of `LlmProvider` — use cases call
  `sink.emit(event)` instead of importing AI SDK writer types.
- `Scanner` — `scanContent({ raw, filename? })`, `scanRepository({ url,
  skillName? })`. Returns a typed `ScanReport` domain value. Adapter:
  `codegate-cli`, which depends on `ProcessRunner`.
- `ProcessRunner` — `run({ cmd, args, input?, env?, timeoutMs?,
  cwd? })` → `{ stdout, stderr, exitCode }`. Adapter:
  `node-child-process`. Makes the `codegate-cli` adapter unit-testable
  with a fake subprocess.
- `GitClient` — `clone({ url, dir, depth })`, `discoverSkills(dir)`.
  Adapter: `isomorphic-git`.
- `PasswordHasher` — `hash(plain)` → `string`, `verify(plain,
  hashed)` → `boolean`. Adapter: `bcrypt-ts`.
- `Clock` — `now()` → `Date`. Adapters: `system`, `fixed` (tests).
- `IdGenerator` — `nextId()` → `string`. Adapters: `crypto`,
  `sequence` (tests).

### Removed from the original plan

- `TitleGenerator` — folded into `send-message`, which calls the
  `LlmProvider` port directly with a fixed title-generation model id and
  emits `data-chat-title` through `ChatEventSink`.
- `BlobUrlSigner`, `MailSender`, `CacheKV`, `SessionStore`,
  `HTTPClient` — none have a current user. Added only if a concrete
  feature demands them.

---

## 6. Phased execution

Fifteen numbered phases, with Phase 3 split into three sub-phases
(3a/3b/3c) for a total of seventeen shippable increments. Each
increment is green-on-main and cannot merge until all three test
levels pass and Biome boundary rules are green.

### Phase 0 — Foundations & scaffolding

**Goal:** lay the rails. No behavior change.

- Create `src/{domain,application,infrastructure,shared}/` as empty
  scaffolds with index barrels.
- Create `tests/{unit,fakes,integration,e2e,fixtures,helpers}/`.
- Add Biome boundary rules; run against existing code; expect
  violations; document as tech debt (not blocking yet).
- Introduce `testcontainers` packages.
- Add `docker/docker-compose.yml` with postgres + redis + minio (no
  `app` service yet).
- Add `src/infrastructure/composition/env.ts` (zod-parsed env, includes
  `IS_DEMO`, `NEXT_PUBLIC_BASE_PATH`, `HACKATHON_MODE`,
  `ENABLE_LOCAL_CLI_MODELS`, `REDIS_URL`, `POSTGRES_URL`).
- Stub `src/infrastructure/composition/container.ts`, wrapping the
  existing legacy modules behind a container interface.
- Add `c8` and split `pnpm test` into `test:unit`, `test:integration`,
  `test:e2e`, and composite `test`.
- Add `tests/helpers/container.ts` — builds a fully faked container.

**Preservation:** existing Playwright E2E still passes against the
running dev server.

**Exit:** CI green; `docker compose up postgres redis minio` works;
`pnpm test` passes; boundary rules reported but not blocking.

### Phase 1 — BDD baseline

**Goal:** ship the testing infrastructure, lock the coverage contract,
and fill high-value gaps. Full ≥59-scenario coverage is authored
**incrementally**: each later phase writes the scenarios for the
features it touches, in the same PR as the adapter/use-case work.
Writing all 59 up front wastes effort on tests that need rewriting when
adapters flip.

Deliverables:

- **Integration test harness** — `tests/helpers/testcontainer-pg.ts`
  boots a Postgres testcontainer, runs migrations, resets tables
  between tests; used by every adapter integration test from Phase 3a
  onward.
- **Feature coverage audit** — `docs/feature-coverage.md` lists every
  §4 row with (a) current test coverage, (b) gap description, (c) the
  phase that closes the gap. Living document updated as phases ship.
- **Strategic gap-fill scenarios** — 5–10 new E2E/integration tests for
  stable, user-visible behavior that will NOT change during the
  refactor (e.g. `/ping`, `/api/models` shape, guest redirect,
  pagination-tie behavior). Features that are about to be rebuilt
  (upload route, chat route internals, AI Gateway routing) are
  explicitly out of scope here.
- **`docs/testing.md`** — how to run each tier, env setup, pitfalls.
- **CI workflow** (`.github/workflows/ci.yml`) — three-tier pipeline
  (unit → integration → E2E smoke subset).
- **Smoke vs. nightly split documented** — smoke subset (the existing
  ~25 E2E tests + Phase 1 additions) runs on every push; full suite
  composed over time runs nightly once it exists.

**Exit:** integration harness green against a live testcontainer
Postgres; coverage audit published; strategic gaps closed;
`docs/testing.md` accurate; CI workflow green.

### Phase 2 — Domain extraction

**Goal:** move pure logic to `src/domain/`. No application or
infrastructure changes yet.

- Move + purify:
  `lib/security/{report-normalization,report-score-semantics,
  reporting-overview,report-finding-detail,github-source-link,
  shell-view,scan-report-view}.ts` → `src/domain/…`.
- Define domain entities and value objects as immutable records with
  factories enforcing invariants.
- Unit-test every domain module ≥95% branch coverage, TDD.

**Preservation:** Playwright green. Old call sites still use legacy
paths; dedup happens in Phase 5.

**Exit:** domain layer has zero non-stdlib imports; `tsc --noEmit`
passes; unit suite green.

### Phase 3a — Persistence ports: user, chat, message, vote, stream

**Goal:** isolate chat-core DB access behind repository ports.

- Define the five port interfaces in
  `src/application/ports/persistence/`.
- Implement `drizzle-postgres` adapters under
  `src/infrastructure/persistence/drizzle-postgres/repositories/`.
- Implement fakes in `tests/fakes/persistence/` sufficient to drive
  unit tests for the Phase-5 use cases that follow.
- Move the schema file to
  `src/infrastructure/persistence/drizzle-postgres/schema.ts` and
  migrations to `.../migrations/`. Update `drizzle.config.ts`.
- Keep `lib/db/queries.ts` alive as a shim delegating to repositories.

**Exit:** `rg 'drizzle-orm' --type ts src/ app/ components/` matches
only under `src/infrastructure/persistence/drizzle-postgres/`. Shim is
the only remaining legacy entry point.

### Phase 3b — Persistence ports: document, suggestion

**Goal:** same shape as 3a, for artifact-adjacent tables.

- Add `DocumentRepository` and `SuggestionRepository` ports + Drizzle
  adapters + fakes.
- Tests for composite-PK semantics specifically
  (`Document(id, createdAt)` FK target).

**Exit:** artifacts read/write through the ports via the shim.

### Phase 3c — Persistence ports: scan + UnitOfWork

**Goal:** the last persistence ports plus transactional orchestration.

- `ScanRunRepository`, `ScanFindingRepository` ports + Drizzle adapters
  + fakes.
- `UnitOfWork` port, Drizzle adapter wrapping `db.transaction`.
- Integration tests: concurrent `sync-scan-reports` calls, duplicate
  `finding_id` handling, rollback on mid-transaction failure.

**Exit:** all DB access routes through a port. Delete
`lib/db/queries.ts` shim.

### Phase 4 — LLM provider port

**Goal:** kill the Vercel AI Gateway path and the ad-hoc provider
routing, **before** building the `send-message` use case.

- `LlmProvider` port.
- Adapters `google-gemini`, `claude-code-local`, `codex-local`.
- `infrastructure/llm/registry.ts` replaces `lib/ai/models.ts`: static
  `ChatModel[]` and `Record<ModelId, ModelCapabilities>` — no fetches to
  `ai-gateway.vercel.sh`.
- `infrastructure/llm/local-models-config.ts` moved from
  `lib/ai/local-models-config.ts`.
- Delete gateway-only models from the registry.
- AI-SDK tool wrappers relocated to
  `infrastructure/llm/ai-sdk-tools/` as thin delegates that call
  application use-cases in subsequent phases.
- `ChatEventSink` port + `ai-sdk-stream-writer` adapter wrapping
  `UIMessageStreamWriter`.

**Exit:** `rg 'ai-gateway.vercel.sh'` returns zero matches. `rg
'gateway' lib/ai/` returns zero matches. Model selector still shows
useful list; streaming via local adapters still works in the existing
route.

### Phase 5 — Application use cases

**Goal:** replace fat route handlers with orchestrated use cases. LLM
port + persistence ports already exist, so `send-message` is built
against them directly — not against legacy and re-wired later.

- Use cases: `send-message`, `continue-approved-tool-call` (separate
  from send-message per audit), `list-chats`, `get-chat`,
  `delete-chat`, `delete-all-chats-for-user`,
  `update-chat-visibility`, `update-chat-title`, `vote-message`,
  `delete-messages-after-timestamp`, `analyze-config`,
  `scan-github-repo`, `sync-scan-reports`, `authenticate-user`,
  `register-user`, `create-guest-user`, `get-overview`,
  `get-finding-detail`, `save-document`, `update-document`,
  `update-document-content`, `list-document-versions`,
  `delete-document-versions-after`, `save-suggestions`,
  `list-suggestions`, `upload-attachment`,
  `register-resumable-stream`, `list-stream-ids`, `ping`.
- `message-stream-orchestrator` application service wires `LlmProvider`
  + `Scanner` + `ChatEventSink` + repositories + `UnitOfWork`.
- `error-presenter` application service translates domain errors to
  `ChatbotError` shapes consumed by the HTTP error-mapping in
  infrastructure.
- AI-SDK tool wrappers now delegate to the use cases.
- Route handlers shrink to ≤30 lines each: parse input, call use case,
  map result to `Response`.

**Preservation + new tests:** the resumable-stream reconnect scenario
lives with this phase (streaming is a `send-message` concern, not a
rate-limiter concern). Integration test covers: client drops mid-stream,
reconnects via `/api/chat/[id]/stream`, receives remaining deltas. Uses
real Redis in the testcontainer stack; skipped if `REDIS_URL` absent
(documented per A5).

**Exit:** every route handler is ≤30 lines and contains no business
logic. Playwright green.

### Phase 6 — Object store port

**Goal:** upload attachments through an S3-compatible object store.

- `ObjectStore` port.
- Adapters: `s3` (AWS SDK + presigner), `filesystem` (dev fallback),
  in-memory fake.
- MinIO service in `docker-compose.yml` + init job that creates the
  bucket and sets a public-read policy for images.
- `upload-attachment` use case validates size and mime in the
  application layer, not in the route.
- Frontend consumers updated to the new `{ url, key, contentType,
  size }` response shape (A3).

**Decommission (code references only):** all imports of `@vercel/blob`
deleted. `package.json` removal happens in Phase 13.

**Exit:** attaching an image via the UI works end-to-end against
MinIO. The image renders after page reload.

### Phase 7 — Request context + bot detection ports

- `RequestContext` port + `http-headers` adapter.
- `BotDetection` port + `noop` adapter.
- Remove `@vercel/functions` imports (`geolocation`, `ipAddress`).
  Acceptance A2 applies (geolocation signal dropped from the system
  prompt).
- Remove `botid` imports from `next.config.ts`,
  `instrumentation-client.ts`, and `app/(chat)/api/chat/route.ts`.
  Delete `instrumentation-client.ts` entirely — no replacement.

**Decommission (code references only):** all imports of
`@vercel/functions` and `botid` deleted. `package.json` removal happens
in Phase 13.

**Exit:** `rg '@vercel/functions|botid' --type ts` returns zero
matches (imports only; the packages still sit in `package.json` until
Phase 13).

### Phase 8 — Rate limiter port

- `RateLimiter` port with atomic "check-and-increment" primitive.
- `redis` adapter using `MULTI INCR / EXPIRE NX`.
- In-memory fake for unit/integration.
- Integration test against a testcontainer redis.

**Decommission:** `lib/ratelimit.ts` deleted.

**Exit:** `send-message` rejects after N messages in window, verified
by integration and E2E.

### Phase 9 — Telemetry + Logger ports

- `Telemetry` port (spans + counters) with `otlp` and `noop` adapters.
- Separate `Logger` port with `console` (default) and `otel` adapters.
- Activate OTLP only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- Replace ad-hoc `console.error` in route handlers with
  `logger.error`.
- Add an optional `otel-collector` service to `docker-compose.yml`
  under a compose profile.

**Decommission (code references only):** all imports of `@vercel/otel`
and `@vercel/analytics` deleted. `package.json` removal happens in
Phase 13 alongside every other Vercel package, to avoid churning the
lockfile phase-by-phase.

**Exit:** `registerOTel` never imported; app boots cleanly with and
without `OTEL_EXPORTER_OTLP_ENDPOINT`.

### Phase 10 — Scanner + ProcessRunner + GitClient ports

- `ProcessRunner` port + `node-child-process` adapter. Every
  `execFileSync` in the codebase routes through it.
- `GitClient` port + `isomorphic-git` adapter. Used by
  `scan-github-repo` for cloning + skill discovery.
- `Scanner` port + `codegate-cli` adapter, depending on
  `ProcessRunner`.
- Bake `codegate-ai` into the app Docker image with `npm i -g
  codegate-ai@<pinned>`.
- Integration test for the full skill-selection flow against a fixture
  repo.

**Decommission:** `lib/security/codegate-cli.ts` and all
`execFileSync` in `lib/ai/tools/`.

**Exit:** scan tools work end-to-end against a local test repository.
All three scan scenarios green.

### Phase 11 — Auth port wiring + PasswordHasher

- `PasswordHasher` port + `bcrypt-ts` adapter.
- `auth/next-auth/` adapter imports only from
  `application/ports/persistence/user-repository.ts` and
  `application/ports/password-hasher.ts`.
- Credentials provider delegates to `authenticate-user`.
- Session callback reads via repository.
- `proxy.ts` middleware refactored to a thin adapter over
  `src/infrastructure/middleware/proxy-adapter.ts`, which calls
  `create-guest-user` / auth checks via the container. `proxy.ts` at
  the repo root becomes a one-line re-export.

**Exit:** `app/(auth)/` and `proxy.ts` contain no `drizzle-orm`,
`postgres`, or `bcrypt-ts` imports.

### Phase 12 — Containerization & composition

- `docker/Dockerfile`:
  - Multi-stage. Stage 1: `node:20-alpine` + pnpm; install; build.
  - Stage 2: `node:20-alpine`; copy `.next/standalone`, `.next/static`,
    `public`. `npm i -g codegate-ai@<pinned>` so runtime is offline-safe.
  - Set `HOME=/app`, `CODEGATE_HOME=/tmp/.codegate`.
- `docker/docker-compose.yml`:
  - `app`, `postgres:16-alpine`, `redis:7-alpine`, `minio/minio` +
    `minio-mc` init, `migrate` one-shot that runs `db:migrate` and
    exits.
  - Healthchecks across dependencies.
  - Optional compose profile: `otel-collector`, `tempo`, `grafana`.
- `next.config.ts`:
  - Enable `output: "standalone"`.
  - Validate `cacheComponents: true` and `reactCompiler: true` still
    work in standalone; if either regresses a scenario, either disable
    or pin a workaround.
  - Remove `withBotId`.
  - Remove `maxDuration = 60` from `route.ts` (Vercel-only).
  - Keep `IS_DEMO=1` / `basePath` / `assetPrefix` logic; drive it from
    the typed `Env`.
- Default adapter selection in `env.ts`: `OBJECT_STORE_DRIVER=s3`,
  `RATE_LIMITER_DRIVER=redis`, `BOT_DETECTION_DRIVER=noop`,
  `TELEMETRY_DRIVER=noop`, `LOGGER_DRIVER=console`.

**Exit:** fresh clone → `cp .env.example .env.local && docker compose
up` → <http://localhost:3000> renders the login screen; registration,
chat, scan, upload, resumable stream reconnect all work.

### Phase 13 — Purge & documentation

- Delete `vercel.json`, `vercel-template.json`.
- Remove `pnpm deploy:prod`.
- Remove `avatar.vercel.sh` from `next.config.ts` image allow-list;
  swap for Gravatar or initials.
- `package.json` purge: `@vercel/blob`, `@vercel/functions`,
  `@vercel/otel`, `@vercel/analytics`, `botid`.
- Delete `artifacts/image/client.tsx` if the Phase 1 scenarios confirm
  it is unused (row 35).
- README rewrite: "Deploy locally with Docker Compose" as primary flow;
  env var matrix; no "Deploy to Vercel" section.
- `docs/architecture.md`: layer diagram, directory map, port list.
- `docs/adapters.md`: template + checklist for adding a new adapter.
- `docs/runbook.md`: first-time setup, migrations, rollback, common
  errors.

**Exit:** all thirteen criteria in §9.

### Phase 14 — Stabilization

- Fix any findings from the post-purge run.
- Backport any missing BDD scenarios exposed by the full compose E2E
  job.
- Re-audit boundary rules; tighten if over-permissive, loosen if they
  block legitimate patterns.
- Publish a migration note for anyone previously running the app on
  Vercel describing the expected data-loss surface (A1).

---

## 7. CI/CD

### 7.1 Pipeline

Single GitHub Actions workflow, stages gated in order:

1. **Install + type-check + lint + coverage.** `pnpm install
   --frozen-lockfile`, `pnpm check`, `tsc --noEmit`,
   `c8 --check-coverage --branches 95`.
2. **Unit tests.** `pnpm test:unit`.
3. **Integration tests.** Testcontainers for postgres + redis + minio,
   `pnpm test:integration`.
4. **E2E tests.** `docker compose -f docker/docker-compose.ci.yml up
   -d --wait`, `pnpm test:e2e`, tear down.
5. **Static audits.** `pnpm audit --audit-level=high` (non-zero exit
   fails CI). `biome check`. Boundary-rule check.
6. **Bundle + cold-start gate.** `pnpm build`, measure `.next/
   standalone` size + first-response latency against a baseline
   committed at the start of Phase 12. >10% regression fails CI.
7. **Build image.** `docker build`. On `main`, push to GHCR.

### 7.2 Local developer workflow

```
pnpm install
docker compose up -d postgres redis minio
pnpm db:migrate
pnpm dev
pnpm test     # runs unit + integration + e2e
```

### 7.3 Branch protection

- `main` requires a passing CI run.
- Biome boundary rules must pass.
- Coverage gate must pass.
- `pnpm audit` must pass.

---

## 8. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Big-bang refactor stalls | 15 small phases; `main` always green; any phase can be the stopping point. |
| R2 | Behavioral regressions | BDD scenarios in Phase 1 are the contract. No phase merges unless the full scenario set passes. |
| R3 | Streaming semantics break when wrapped by a use case | `send-message` returns a `ReadableStream<ChatEvent>` domain type; the route adapter pipes it to `UIMessageStreamWriter`. `ChatEventSink` isolates the AI SDK writer behind a port. Integration test scripts a scripted LLM stream and verifies deltas byte-for-byte. |
| R4 | Tool approval flow is stateful across requests, not a branch | Extracted into its own use case (`continue-approved-tool-call`). Separate BDD scenario covers the replay path. |
| R5 | Resumable streams + `waitUntil: after` | `next/server`'s `after` works outside Vercel with different semantics; integration test exercises client disconnect + reconnect against a live Redis + full compose stack. |
| R6 | Playwright E2E slow → tempting to skip | CI always runs all three tiers. Compose stack warmed via `--wait`; only one E2E job, parallelized. |
| R7 | `codegate-ai` CLI version drift | Pin the version in `package.json` and the Dockerfile's global install; integration test asserts version. |
| R8 | Losing bot protection on `/api/chat` | Session cookie required; per-IP rate-limit + per-user hourly cap enforced in `send-message`. `turnstile` adapter reservation for future opt-in. |
| R9 | Geolocation drop changes prompt subtly (A2) | Accepted in §1. Release notes. |
| R10 | Testcontainers slow | Pre-pull images in CI setup; one container per test file; schema truncation between tests, not migration re-run. |
| R11 | Boundary rules restrict legitimate imports | Tuned during Phase 0 before made blocking. |
| R12 | Auth.js coupling to Next internals | Auth.js confined to `auth/next-auth/` adapter; use cases own logic; session callback merely reads the repo. |
| R13 | MinIO policy + public-URL gotchas | Integration test uploads + fetches + diffs bytes. |
| R14 | Stranded Vercel Blob URLs (A1) | Accepted in §1. Release notes. Operators who need to preserve old attachments must run their own rewrite. |
| R15 | Cursor pagination tie bug (`getChatsByUserId` on `createdAt` ties) | Phase 1 spec documents current behavior. If a BDD scenario shows observable breakage, add a secondary `ORDER BY id` in the same PR and ship a targeted fix — not as part of the main refactor. |
| R16 | `cacheComponents` + `reactCompiler` + standalone output interaction | Phase 12 explicitly validates; fallback is to disable either flag if a scenario regresses. |
| R17 | `c8` coverage gate too strict | Configurable by layer: 95% domain + application; adapters exempt; UI components exempt. Gate threshold ratcheted in Phase 2+. |
| R18 | Bundle/cold-start regression vs Vercel's optimizer | Phase 12 captures baseline before flipping standalone; CI gate catches >10% drift; investigate per-case, not per-refactor. |
| R19 | `artifacts/image/client.tsx` turns out to be live-used | Phase 1 scenarios detect it. If detected, promote the dead-code finding to a legitimate feature and write the missing server half. If not detected, delete in Phase 13. |
| R20 | `proxy.ts` edge-runtime limitations differ from Node runtime | The middleware adapter in `src/infrastructure/middleware/` stays compatible with both runtimes; container wiring in middleware uses the same singleton pattern but with a runtime-specific lazy boot. Integration test runs middleware under both runtimes. |

---

## 9. Exit criteria

The project is "done" when all of these are true:

1. `rg '@vercel' src/ app/ components/ hooks/ tests/ proxy.ts next.config.ts instrumentation.ts` returns zero matches.
2. `rg 'botid' src/ app/ components/ hooks/ tests/ proxy.ts next.config.ts` returns zero matches.
3. `rg 'ai-gateway.vercel.sh'` across the repo returns zero matches.
4. `rg 'drizzle-orm' src/ app/ components/ hooks/ tests/` returns matches **only** under `src/infrastructure/persistence/drizzle-postgres/`.
5. `rg 'execFileSync|spawn\(' src/ app/ components/ hooks/ tests/` returns matches only under `src/infrastructure/process-runner/` and test helpers.
6. `rg 'maxDuration' app/ src/` returns zero matches (Vercel-specific export removed from `route.ts`).
7. Fresh clone: `cp .env.example .env.local && docker compose up` yields a fully functional app with no secrets beyond those in `.env.example`, and **the smoke subset of BDD scenarios (~30) passes against the live compose stack** in CI under `docker-compose.ci.yml`. The full ≥59-scenario suite passes in the nightly job.
8. Biome boundary rules pass; `pnpm audit --audit-level=high` passes.
9. `c8` coverage gate passes (≥95% branches domain + application).
10. Bundle size and cold-start latency within 10% of the Phase 12 baseline.
11. `drizzle-kit` migration forward and one step backward both succeed against a seeded test database (reversibility check).
12. HMR in dev resets the composition container without leaking connections or adapter instances across reloads (verified by a smoke test that reloads N times and asserts connection count).
13. `README.md`, `docs/architecture.md`, `docs/adapters.md`,
    `docs/testing.md`, `docs/runbook.md` exist and are accurate.

---

## 10. Glossary

- **Port:** a TypeScript interface in `src/application/ports/`
  describing a capability the application needs.
- **Adapter:** a concrete implementation of a port living in
  `src/infrastructure/`.
- **Fake:** a test-only implementation of a port under `tests/fakes/`.
  Fakes are NOT adapters; they exist to drive unit tests and make no
  claim to semantic equivalence with real adapters.
- **Use case:** a function (or class with a single method) in
  `src/application/use-cases/` that orchestrates domain objects and
  ports to accomplish one user-visible action.
- **Composition root:** the one place in the codebase
  (`src/infrastructure/composition/container.ts`) that reads env
  config, instantiates adapters, and hands the whole graph to the rest
  of the app.
- **Adapter equivalence test:** a contract test parameterized over
  multiple adapters of the same port, asserting every adapter satisfies
  the same invariants. Used for `ObjectStore` (s3 vs filesystem) and
  `RateLimiter` (redis vs in-memory-fake-via-testcontainer). Not used
  for persistence; see §3.1 for rationale.
- **BDD scenario:** a `test()` block whose name follows "Given … When …
  Then …" phrasing and whose body exercises the full stack through
  Playwright or the integration harness.
- **A-tag (e.g. A1):** explicitly accepted behavioral change. See §1.
