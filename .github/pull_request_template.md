## What this changes

## Why

<!-- The problem, not a restatement of the diff. -->

## How it was verified

<!-- Which suites, and anything you exercised by hand. "Tests pass" on its own
     says less than which behaviour you watched change. -->

- [ ] `pnpm check` and `pnpm exec tsc --noEmit`
- [ ] `pnpm test:unit`
- [ ] `pnpm test:integration` (needs Docker)
- [ ] `pnpm test:e2e` (needs a running server)

## If this touches the agent-facing API

- [ ] The wire contract stays backward compatible, or the break is stated here
      and in the README — machines in the field run older agents and cannot be
      upgraded by this server.

## If this touches what leaves a machine

- [ ] Nothing new is collected without an operator turning it on
- [ ] The risk-surface allowlist still excludes credential-bearing artifacts
