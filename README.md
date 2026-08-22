![CodeGate Guardian](docs/image/codegate-guardian.png)

# CodeGate Guardian

Guardian is a self-hosted console for seeing what AI tooling your developers
actually have installed, and which of it is dangerous.

The `codegate` CLI runs on each developer machine. It inventories every AI
tool, skill, MCP server and rules file it finds, scans them, and reports what
it saw to this server. Guardian aggregates those reports and shows them.

**This server never sends anything to a machine.** It receives, evaluates and
displays. Remediation happens on the machine, by the person who owns it, and
the next report is the evidence it happened. Revoking an enrolment stops this
server accepting a machine's reports; it does not reach the machine.

## What it shows

- **Machines** — every machine reporting, who is accountable for it, what it
  carries, and when it last checked in.
- **Inventory** — artifacts keyed by **content hash, not by name**. Two files
  sharing a name but differing by one byte are two artifacts, so a malicious
  skill cannot hide behind a familiar filename.
- **Findings** — with a lifecycle nobody has to maintain: a finding is open
  while a machine still reports it, and resolves when a later report from that
  machine no longer contains it. Status is derived, never stored.
- **Policies** — rules evaluated here against what each machine reported.
  Guardian flags a violation; it cannot block anything on a laptop.
- **Activity** — who or what did something, and the API call behind it.
- **API & access** — the console is a client of its own API. Anything you can
  do here, a script can do with a session.

## Quick start

```bash
cp .env.example .env

# Session signing secret
openssl rand -base64 32           # → AUTH_SECRET

# Without this, no machine can report in
openssl rand -hex 32              # → AGENT_INGEST_TOKEN

docker compose -f docker/docker-compose.yml up --build
```

Open http://localhost:3000, register an operator, and the console asks you to
connect your first machine.

**Both variables are required.** `AUTH_SECRET` signs sessions. Without
`AGENT_INGEST_TOKEN` the ingest endpoint is closed: enrolment answers 503, and
the console's overview tells you so rather than sitting empty and looking
healthy.

## Enrolling a machine

Enrolment codes are minted in the console under **API & access**, and are
single-use and expiring by default. On the machine:

```bash
npx codegate-ai enrol --server https://guardian.example.internal --code FLEET-XXXX-XXXX
codegate report
```

Enrolment issues that machine **its own reporting token**, which the agent
stores at `~/.codegate/fleet.json`. Guardian identifies a check-in by that
token, not by the machine id in the request body — otherwise any agent could
report as any machine, and by omitting findings, mark it clean.

For a fleet rollout, mint a multi-use code and ship the server URL and code
through your MDM.

## Configuration

Everything else has a working default; see `.env.example` for the full list.

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | **Required.** Signs sessions. |
| `AGENT_INGEST_TOKEN` | **Required to accept agents.** Its presence is what opens enrolment. |
| `POSTGRES_URL` | Any standard-wire-protocol Postgres. |
| `APP_URL` | The absolute URL this instance is served from. |
| `OBJECT_STORE_DRIVER` | `filesystem` (default) or `s3`. |

## Access

There is no anonymous access. An unauthenticated browser is sent to `/login`;
an unauthenticated API call is answered `401`. Agents authenticate with their
own bearer token rather than a session cookie.

## Development

```bash
pnpm install
pnpm dev

pnpm test:unit          # pure logic, no services
pnpm test:integration   # real Postgres via testcontainers
pnpm test:e2e           # a browser against a running server
pnpm check              # lint and format
```

The console's screens are verified against a sealed design: `tests/e2e`
asserts the landmarks each screen carries, so a screen that silently loses its
chrome or its actions fails the suite.

## Architecture

- **Next.js** app router, with the console in the `(fleet)` route group and
  its own stylesheet ported from the design.
- **Drizzle + Postgres**. Findings status is derived from report history at
  query time; the only mutable bit is an acknowledgement.
- **Ports and adapters** under `src/`: routes resolve everything through the
  composition root in `src/infrastructure/composition`.
