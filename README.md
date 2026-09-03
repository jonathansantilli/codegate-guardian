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

# Without this, no new machine can enrol
openssl rand -hex 32              # → AGENT_INGEST_TOKEN

# Claims the instance — you will be asked for it when you register
openssl rand -hex 32              # → SETUP_TOKEN

docker compose up --build
```

### First run, step by step

1. **Open http://localhost:3000.** You land on the sign-in page; there are no
   accounts yet, so follow "No account? Sign up".
2. **Create the first operator.** The form asks for an email, a password, and
   the **setup token** — the `SETUP_TOKEN` you generated above. That token is
   what makes this account yours rather than whoever else can reach the port.
3. **Registration closes behind you.** The setup-token field disappears and
   the sign-up form closes for good. This console has a single operator —
   there is no way to add a second.
4. **Generate an enrolment code** under **API & access**.
5. **Connect a machine**, using the code:
   ```bash
   npx codegate-ai enrol --server http://localhost:3000 --code FLEET-XXXX-XXXX
   npx codegate-ai report
   ```
6. The machine appears under **Machines**, with everything it carries and
   anything found on it.

**All three are required.** `AUTH_SECRET` signs sessions. Without
`AGENT_INGEST_TOKEN` enrolment is closed: it answers 503, no new machine can
join, and the console's overview tells you so rather than sitting empty and
looking healthy. Machines already enrolled keep reporting regardless — they
authenticate with their own tokens. `SETUP_TOKEN` is what claims the instance.

**Why a setup token.** A fresh install has to let somebody in to become the
first operator, and until that happens, reaching the port is the whole of
authentication — the compose stack publishes on `0.0.0.0:3000`, so on a
networked host that window belongs to whoever finds it first. The token means
it belongs to whoever deployed it. Registration closes behind the first
operator, and the token is no longer used.

## Letting agents reach it

The compose stack publishes the console on `127.0.0.1` only. That is
deliberate: between `docker compose up` and someone claiming the instance,
reaching the port is most of what stands in the way, and a laptop on shared
wifi should not be publishing an unclaimed security console.

It also means **no other machine can enrol until you widen it**. Once you have
registered as the operator:

```bash
echo "APP_BIND=0.0.0.0" >> .env
docker compose up -d
```

Prefer putting a TLS-terminating reverse proxy in front of it over publishing
the container directly — session cookies and agent tokens both cross the wire,
and `APP_URL` is the address enrolling machines are told to report to.

## Enrolling a machine

Enrolment codes are minted in the console under **API & access**, and are
single-use and expiring by default. On the machine:

```bash
npx codegate-ai enrol --server https://guardian.example.internal --code FLEET-XXXX-XXXX
npx codegate-ai report
```

Enrolment issues that machine **its own reporting token**, which the agent
stores at `~/.codegate/fleet.json`. Guardian identifies a check-in by that
token, not by the machine id in the request body — otherwise any agent could
report as any machine, and by omitting findings, mark it clean.

For a fleet rollout, mint a multi-use code and ship the server URL and code
through your MDM.

## Upgrading from a version before per-machine tokens

**Every enrolled machine must enrol again, and the fleet goes quiet the moment
you upgrade — not gradually.**

Agents used to authenticate with the shared `AGENT_INGEST_TOKEN`. They now
each hold a token issued at enrolment, because a shared secret let any agent
report as any machine and, by omitting findings, mark it clean. A machine
still presenting the old token is refused with `401 unknown_token`.

You will see this on **Activity**: every refused check-in is recorded with the
reason, so a screen full of `401 unknown_token` means "these machines predate
per-machine tokens", not "something is misconfigured".

To fix a machine, mint a code under **API & access** and enrol it again. Its
history, ownership and findings are kept — the row is the same, only the
credential changes.

Two things that changed meaning:

- `AGENT_INGEST_TOKEN` no longer authenticates anything. Its presence is what
  says this server accepts enrolments. Rotating it does not affect machines
  that are already enrolled, and does not fix ones that are not.
- Enrolment binds a machine that holds no credential, and never takes one from
  a machine that does. A machine already holding a token, or one that has been
  revoked, is refused with `409` — that is what stops anyone holding a cohort
  code from seizing another machine's identity, and what stops a revoked
  machine lifting its own revocation. Machines upgrading from the shared token
  hold no credential, so they enrol normally. Re-admitting a revoked machine
  is an operator action: **Restore enrolment** on its page, which retires the
  withdrawn credential so the machine enrols afresh.

## What a machine sends, and what it does not

A check-in carries an inventory — for each artifact, which tool it belongs to,
its kind and scope, where it lives, the risk surface it represents, and a
sha256 of its bytes — along with the findings the agent's scan produced: rule,
severity, category, which layer raised it, the file, and the specific lines
that matched.

**The files themselves stay on the machine.** Guardian identifies an artifact
by its hash, which is how it can tell two files apart without ever holding
either one.

### Collecting artifact content

That default can be changed, deliberately, by an operator. `PUT
/api/fleet/collection-policy` turns on content collection; it is **off until
somebody turns it on**, and turning it on is recorded in Activity with the
operator's name against it.

With it on, agents read the policy from `GET /api/agent/policy` before a
check-in and offer the bytes of the artifacts it permits. Two rules bound what
that can ever mean:

- **Only prose surfaces.** An artifact qualifies only if *every* risk surface
  it declares is in `prompt_injection`, `unicode_backdoor`, `command_exec` —
  the surfaces that sit on skills, rules and instruction files. Anything
  declaring `mcp_config`, `env_override`, `ide_settings` or any other surface
  is refused, because those sit on configuration and configuration is where API
  keys live. The list is an allowlist, so a surface added to the agent's
  knowledge base later is refused until somebody widens it on purpose.
- **Both sides enforce it.** The agent applies the policy before sending, and
  this server applies every rule again to what actually arrived — including
  re-hashing the bytes, because storage is keyed by hash and content filed
  under a hash it does not have would corrupt every identity claim built on it.
  A modified agent offering a settings file gets it refused here.

Content is stored once per hash for the whole fleet, not once per machine.

## What it talks to

Postgres, and nothing else. There is no hosted database, no analytics, no
error reporting and no external API — the compose stack is the whole system,
and the container holds one outbound connection, to its own database.
Next.js's anonymous telemetry is disabled in the `dev`, `build` and `start`
scripts and in every stage of the Dockerfile, so no build reports anywhere
either.

That includes the build. Fonts are vendored in `app/fonts/` rather than
fetched from Google, so a build needs nothing beyond this repository and its
npm dependencies — verified by building with the network pointed at a dead
proxy.

## Configuration

Everything else has a working default; see `.env.example` for the full list.

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | **Required.** Signs sessions. |
| `AGENT_INGEST_TOKEN` | **Required to accept agents.** Its presence is what opens enrolment. |
| `SETUP_TOKEN` | **Required to claim a fresh instance.** Unset means it cannot be claimed. |
| `POSTGRES_URL` | Any standard-wire-protocol Postgres. |
| `APP_URL` | The absolute URL this instance is served from. Also handed to Auth.js as `AUTH_URL` (unless you set that yourself), so sign-in and sign-out redirects point at this address rather than the container's bind address. |
| `SITE_URL` | Optional. The product's own site, a separate deployment. Set it and the sign-in screen shows a "Back" link to it; unset, no link. Read at runtime, so the published image honours it. |
| `NEXT_PUBLIC_BASE_PATH` | Optional. Path prefix when the console is served under a sub-path rather than at a domain root. |
| `POSTGRES_DB` | Optional. Database name for the compose stack. Defaults to `postgres`. |
| `POSTGRES_CONTAINER` | Optional. Overrides how `pnpm fresh` finds the local Postgres container. |

## Access

There is no anonymous access. An unauthenticated browser is sent to `/login`;
an unauthenticated API call is answered `401`. Agents authenticate with their
own bearer token rather than a session cookie.

**The first person to register becomes the operator**, and must present
`SETUP_TOKEN` to do it — so a networked instance cannot be claimed by whoever
reaches the port first. Registration then closes for good.

**One instance, one operator.** There is no user management, no roles and no
way to add a second account: everyone who needs the console shares that login,
or you run an instance per team. This is a deliberate limit of this version
rather than an oversight — a console that can add operators needs invitations,
roles and an audit trail of who granted what, and none of that is built.

### Restoring a machine

Restore reopens a revoked machine so its agent can enrol again. The window
lasts an hour and closes as soon as the machine comes back. It carries no
credential of its own, so while it is open any holder of a live enrolment code
could claim that machine — restore when the machine is ready, not in advance,
and revoke the code as well if the machine was compromised.

### Keeping the database from growing forever

Every machine writes a report on every check-in, and nothing removes them on
its own. `pnpm prune` deletes what the console no longer needs — run it from
cron on anything long-lived:

```
0 4 * * *  cd /srv/guardian && pnpm prune
```

Reports older than 90 days go, and activity older than 180
(`REPORT_RETENTION_DAYS` and `ACTIVITY_RETENTION_DAYS` change that). Two
reports per machine are kept regardless of age: its latest, which "last seen"
and the current inventory come from, and its latest findings-bearing one,
which every finding's status is derived from. Pruning that second one would
not trim history — it would make the machine look clean.

### Starting over

Once you have registered, the console is claimed and the sign-up form stops
asking for the setup token — so the first-run path is the one you can no
longer reach. To get it back on a local stack:

```bash
pnpm fresh                                              # drops the database
docker compose up -d --build   # rebuilds the schema
```

Then http://localhost:3000 asks for `SETUP_TOKEN` again. `pnpm fresh` refuses
to run against anything that does not look like a local stack.

## Releases

Versions are derived from the commit history, not written by hand. A push to
`main` runs [semantic-release](https://semantic-release.gitbook.io/): it reads
the commit subjects since the last tag, decides whether that is a patch, a
minor or a major, writes `CHANGELOG.md`, tags the commit and cuts a GitHub
release.

That makes the commit subject the thing that decides whether a change ships.
Subjects follow [Conventional Commits](https://www.conventionalcommits.org/) —
`feat:` gives a minor; `fix:`, `perf:`, `refactor:`, `build:` and `revert:`
give a patch; a `BREAKING CHANGE:` footer gives a major. `ci:`, `chore:`,
`docs:`, `style:` and `test:` cannot change what an operator runs, so they
produce no release and ride along with the next one that does. A subject that
does not parse produces no release either, which is why pull request titles
are linted: they become the commit message when a pull request is squashed.

No npm package is published — this is a self-hosted console, `private: true`,
and there is nowhere to publish it to. What a release gives you is a tag, notes
saying what changed before you upgrade an instance holding your fleet's data,
and container images.

### Container images

Every release publishes both images the compose stack runs, for `linux/amd64`
and `linux/arm64`:

```
ghcr.io/jonathansantilli/codegate-guardian:1.0.0
ghcr.io/jonathansantilli/codegate-guardian-migrate:1.0.0
```

Also tagged `1.0`, `1` and `latest`. Pin to the full version in anything you
deploy: `latest` will move under you, and this console holds your fleet's
inventory.

The migrate image is the one-shot container that applies migrations before the
console starts. Publishing only the console would leave you building half of it
yourself.

To run a published release instead of building from source, point the compose
stack at the registry:

```bash
docker compose up -d   # after setting `image:` on both services
```

### Bill of materials

Each image carries an SBOM and a build provenance attestation in the registry,
readable with any tool that understands them:

```bash
docker buildx imagetools inspect \
  ghcr.io/jonathansantilli/codegate-guardian:1.0.0 --format '{{ json .SBOM }}'
```

The same SBOM is attached to the GitHub release as an SPDX file, for reading
rather than tooling. On a console that receives what your developers have
installed, being able to enumerate what the console itself is made of is not a
formality.

Versions start at 1.0.0. The `3.1.0` this repository carried until then was
inherited verbatim from the Vercel AI Chatbot template it was forked from,
where it still is — it was never a version of this product, was never
released, and appeared nowhere an operator could see it.

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
