---
name: Bug report
about: Something in the console or the ingest endpoint behaves incorrectly
title: ""
labels: bug
assignees: ""
---

## What happened

## What you expected instead

## How to reproduce

1.
2.
3.

## Your deployment

- How it runs: <!-- the compose stack, or describe your own arrangement -->
- Guardian version or commit:
- `codegate` agent version, if a machine is involved:
- Postgres version:

## What the console says

If a machine is involved, **Activity** records every refused check-in with its
reason, and that is usually the answer. Paste the relevant rows.

<!--
Redact before posting. Do not include:
  - the contents of .env
  - AUTH_SECRET, SETUP_TOKEN or AGENT_INGEST_TOKEN
  - an enrolment code, or a machine's reporting token (cgm_...)
A reporting token is a working credential for that machine's identity.
-->
