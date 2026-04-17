# Testing

The project runs three test tiers. CI runs all three on every push.

| Tier | Runner | Script | Fixture source | Typical duration |
|---|---|---|---|---|
| Unit | `node:test` via `tsx` | `pnpm test:unit` | Hand-built fakes, no I/O | Seconds |
| Integration | `node:test` + testcontainers | `pnpm test:integration` | Real Postgres/Redis/MinIO in throwaway Docker containers | Tens of seconds to minutes |
| E2E | Playwright | `pnpm test:e2e` | Full Next.js dev server (or docker-compose stack in CI) | Minutes |

`pnpm test` runs all three in order.

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker Desktop or an equivalent (required for integration + E2E tiers)

## Running locally

### Unit tests (fastest)

```bash
pnpm test:unit
# watch mode:
pnpm test:unit:watch
# with branch coverage:
pnpm test:unit:coverage
```

Unit tests live under `tests/unit/` and `tests/fakes/`. They cover the
domain and application layers — pure logic, no I/O. The test files are
plain `node:test` suites with `describe` / `it`.

### Integration tests

```bash
pnpm test:integration
```

Each integration test file boots its own testcontainer(s) in
`beforeAll` and tears them down in `afterAll`. Between individual tests,
state is reset with lightweight helpers (e.g. `harness.resetDatabase()`
truncates every table rather than re-running migrations).

The canonical Postgres harness lives at
`tests/helpers/testcontainer-pg.ts`:

```ts
import {
  type PostgresHarness,
  startPostgresHarness,
} from "@/tests/helpers/testcontainer-pg";

let harness: PostgresHarness;

before(async () => { harness = await startPostgresHarness(); });
after(async () => { await harness.stop(); });
beforeEach(async () => { await harness.resetDatabase(); });
```

Add a similar helper per external dependency as adapters arrive:
`testcontainer-redis.ts`, `testcontainer-minio.ts`. One container per
test file, not per test — container startup is expensive, truncation is
cheap.

### E2E tests

```bash
pnpm test:e2e
```

Playwright starts `pnpm dev` automatically (see `playwright.config.ts`
`webServer` block) and hits `http://localhost:3000`. Environment
variables come from `.env.local`.

For a faster inner loop during E2E development:

```bash
pnpm dev &                         # start the server once
pnpm exec playwright test --ui     # interactive runner
```

Playwright tests live under `tests/e2e/` and follow the pattern
`*.test.ts`. See `tests/pages/` and `tests/prompts/` for shared page
objects and prompt helpers.

## Writing tests

### BDD scenario naming

Test names follow a "Given / When / Then" phrasing — the §4 feature
preservation table in `docs/decouple-vercel.md` is the contract, and
test names make the link explicit:

```ts
test.describe("Feature: proxy middleware — liveness", () => {
  test(
    "Given a GET /ping request, when no auth exists, then /ping responds 200",
    async () => { … },
  );
});
```

Each PR that adds or changes a feature updates its row in
`docs/feature-coverage.md` (status column, current-coverage column).

### Using the fake container for unit tests

Use-case tests should construct a fake `ApplicationContainer`:

```ts
import { buildFakeContainer } from "@/tests/helpers/container";

const container = buildFakeContainer({
  env: { RATE_LIMITER_DRIVER: "in-memory" },
});
```

As phases land, the `tests/fakes/` directory accumulates port fakes
(e.g. `tests/fakes/persistence/in-memory-user-repository.ts`). Wire them
into `buildFakeContainer` through an overrides argument — never mutate
the real adapter.

### Coverage expectations

| Layer | Expectation |
|---|---|
| `src/domain/**` | ≥95% branch coverage (unit-only) |
| `src/application/**` | ≥95% branch coverage (unit-only) |
| `src/infrastructure/**` | Integration-covered; unit coverage optional |
| React / Next.js route handlers | E2E-covered; unit coverage optional |

The `pnpm test:unit:coverage` script runs `c8` scoped to domain + application.

## Debugging

### Integration test hangs

- Docker daemon not running — start Docker Desktop.
- Old containers holding ports — `docker ps | grep codegate` and remove
  stale containers.
- Image pull timeout on cold machine — run `docker pull
  postgres:16-alpine redis:7-alpine minio/minio` up front.

### Playwright flake

- `trace: "retain-on-failure"` in `playwright.config.ts` saves traces
  for failed runs under `test-results/`. Open with `pnpm exec playwright
  show-trace path/to/trace.zip`.
- Streaming-related flake: assertions on streamed content should use
  `toBeVisible({ timeout: 30_000 })` — the AI response can take several
  seconds.

### `tsx --test` resolution quirks

- Path aliases (`@/…`) work thanks to `tsconfig.json` `paths`. If a
  test imports a `.ts` file that imports another via `./name` without
  extension, it works; adding an explicit `.js` extension (Node ESM
  convention) breaks inside `tsx --test`.
- Don't use default exports for test modules; `node:test` picks up
  `describe` / `it` / `before` / `after` via named imports.

## Adding a new BDD scenario

1. Find the feature row in `docs/feature-coverage.md`.
2. Write the test in the right tier (unit / integration / E2E).
3. Name it `Given … When … Then …`.
4. Update the row's status in `docs/feature-coverage.md` from ❌/🟡 to
   ✅ in the same PR.
5. If the scenario depends on a port that doesn't exist yet, leave the
   row as a gap and note the phase that will close it.
