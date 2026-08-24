# Testing

Three layers, each with a different question to answer and a different cost.

| Layer | Runner | Command | What it runs against | Cost |
|---|---|---|---|---|
| Unit | `node:test` via `tsx` | `pnpm test:unit` | Pure functions, no I/O | Under a second |
| Integration | `node:test` + testcontainers | `pnpm test:integration` | A real Postgres in a throwaway container | Tens of seconds |
| End-to-end | Playwright | `pnpm test:e2e` | The built app in a browser | A minute or two |

`pnpm test` runs all three in that order.

## Unit

`tests/unit/**/*.test.ts`. These cover the rules that decide things: severity
ordering, finding presentation, CSV escaping, setup-token comparison, machine
token minting, env parsing. Nothing here touches a database or a network — if
a test needs either, it belongs one layer down.

## Integration

`tests/integration/**/*.test.ts`, against a real Postgres started by
testcontainers. `tests/helpers/testcontainer-pg.ts` starts one container per
test file and truncates between tests: container startup is expensive,
truncation is cheap.

```ts
const harness = await startPostgresHarness();
after(async () => { await harness.stop(); });
beforeEach(async () => { await harness.resetDatabase(); });
```

This layer is where the derived finding lifecycle is proven — that a later
report omitting a finding resolves it, and that an inventory-only report
resolves nothing. Those behaviours depend on real SQL ordering and cannot be
faked convincingly.

Docker must be running. On a cold machine, `docker pull postgres:16-alpine`
first so the first test does not time out pulling an image.

## End-to-end

`tests/e2e/**/*.test.ts`. Playwright builds the app and starts it itself
(`webServer` in `playwright.config.ts`), so do not have a dev server on the
same port when running it.

`operator.setup.ts` runs first and signs in, storing session state the other
specs reuse. On an unclaimed instance it registers the first operator, which
needs `SETUP_TOKEN` in the environment of the test process — not just the
app's. The password it uses is generated once and kept in the gitignored
`tests/e2e/.auth/operator-credential.json`.

Running locally against the compose stack:

```bash
export POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/postgres
export SETUP_TOKEN=<anything>
export AGENT_INGEST_TOKEN=<anything>
export AUTH_SECRET=<anything>
CI=1 pnpm test:e2e
```

`CI=1` matters: without it Playwright reuses an existing server, which points
the suite — one that registers operators, mints enrolment codes and posts
agent reports — at whatever is already running on port 3000.

This layer carries the security regressions. `fleet-console.test.ts` pins the
attacks that were once possible: a machine claiming another machine's
`machineId` to resolve its findings, enrolment seizing a machine that already
exists, and unauthenticated access to every fleet route. Those tests exist
because each one was a real hole; treat a failure there as a security
regression, not a flaky test.

## Troubleshooting

- Docker daemon not running — start Docker Desktop.
- Old containers holding ports — `docker ps | grep codegate` and remove them.
- `port 3000 is already used` from Playwright — a dev server is running; stop
  it, or the suite will refuse rather than pollute it.
- E2E setup fails to sign in on a database that already has a different
  operator — registration closes permanently behind the first account, so
  either use that account's credential or reset the database.
