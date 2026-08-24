# Contributing

Thanks for looking. Guardian is a security console, so the bar for changes is
"can a reviewer convince themselves this is safe", not "does it work".

## Getting it running

```bash
pnpm install
cp .env.example .env.local          # set AUTH_SECRET and SETUP_TOKEN
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

`docs/testing.md` covers the three test layers and how to run them.

## Before you open a pull request

```bash
pnpm check          # biome lint + types; must be clean, no warnings
pnpm test           # unit, integration, end-to-end
```

Integration and end-to-end tests need Docker running.

## What gets a change rejected

- **A claim in a comment or in the docs that the code does not back.** This
  repository has shipped false security claims before and they were caught by
  review. If you write "X cannot happen", there should be a test named after
  it.
- **Widening what an unauthenticated caller can do.** `proxy.ts` decides what
  is reachable without a session, and `app/api/agent/*` is reachable by
  machines holding a token. Changes there need a test proving the new
  boundary.
- **Attributing a report to anything other than the token that carried it.**
  A machine's identity is its credential, never a field in the payload it
  sent. `tests/e2e/fleet-console.test.ts` pins this; that test exists because
  it was once possible to mark another machine clean.
- **Storing finding status.** Status is derived from reports at query time.
  Writing it down makes the console and the machine disagree the moment
  someone edits the database.

## Design constraints worth knowing before you propose something

- **The server never sends anything to a machine.** No remote scan, no
  quarantine, no policy push. It receives reports, displays them, and can stop
  accepting a machine's reports. Remediation happens on the machine, by a
  person, and the next report is the only evidence it happened.
- **Identity is a content hash.** Files are the same artifact when their
  bytes match, never when their names or paths match.
- **This version has one operator.** There is no user management and no roles.

## Reporting a vulnerability

Do not open a public issue — see [SECURITY.md](SECURITY.md).
