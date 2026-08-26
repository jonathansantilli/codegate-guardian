# Security Policy

## Supported Versions

| Version              | Supported      |
| -------------------- | -------------- |
| Latest release       | ✅             |
| Older releases       | ⚠️ Best effort |
| Unreleased branches  | ❌             |

## How to report a vulnerability

Please report vulnerabilities privately first.

1. Do not open a public GitHub issue.
2. Use GitHub's private vulnerability reporting on this repository
   (**Security → Report a vulnerability**), including:
   - affected version
   - reproduction steps
   - impact assessment
   - proof-of-concept (if available)
3. We will acknowledge receipt within 5 business days and assign a tracking status.

## Disclosure Process

- We validate and triage the report.
- We coordinate a fix and release timeline.
- We publish an advisory after a fix is available (or mitigation guidance if no fix is immediately possible).

## Security Notes for Operators

Guardian is a console that receives reports. It never sends anything to a
machine, so a compromise of this server cannot be used to push a change to a
developer's laptop. What it does hold is an inventory of every machine's AI
tooling and its findings, which is worth protecting on its own.

- **`SETUP_TOKEN` claims a fresh instance.** Until somebody registers, reaching
  the port is the whole of authentication. Set this before the first start;
  leaving it unset means the instance cannot be claimed at all, which is the
  safe way to be wrong. Registration closes for good once an operator exists.
- **`AGENT_INGEST_TOKEN` opens enrolment.** Its absence closes enrolment: no
  new machine can join. It does not close ingest — machines that have already
  enrolled keep reporting with their own per-machine tokens, which is what
  makes rotating it safe. Rotate by restarting with a new value.
- **Each machine reports with its own token.** A report is attributed to the
  machine whose token authenticated it, never to the `machineId` in the
  payload, so a compromised agent cannot resolve or forge another machine's
  findings. The token is a bearer credential in an `Authorization` header —
  nothing is cryptographically signed, so treat the token as the secret it is
  and serve the console over TLS.
- **Revoke a machine from Access** when a laptop is lost or rebuilt. A revoked
  token is refused at ingest and the rejection is recorded. Revoking stops
  *that machine*: it does not stop whoever holds a still-valid enrolment code
  from enrolling as a **new** machine, so revoke the code too if the machine
  was compromised rather than merely retired.
- **Restoring a machine opens a one-hour window** in which it may re-enrol
  without a token. That window is opened by an operator and closes by itself;
  while it is open, any holder of a live enrolment code can claim that
  machine's identity. Restore when the machine is ready to come back, not in
  advance.
- **Sign-in attempts are limited** to 10 failures per address per 15 minutes,
  counted in the database. A locked-out address is refused before the password
  is checked.
- **A person's session cannot be revoked.** Sessions are JWTs with a 30-day
  expiry; signing out clears the cookie but does not invalidate it, so a
  stolen session cookie outlives a password change. The console can cut off a
  machine, not a person. If an operator account is compromised, rotate
  `AUTH_SECRET` and restart — that invalidates every existing session.
- **Serve it over TLS.** Session cookies and agent tokens both cross the wire;
  the proxy expects the scheme it issued cookies under.
- **The console is published on loopback by default.** `docker compose up`
  binds it to `127.0.0.1`, so a fresh instance is not reachable from the
  network during the window before anyone has claimed it — which is exactly
  when reaching the port is most of what stands in the way. Agents on other
  machines cannot reach it until you set `APP_BIND=0.0.0.0`, which is a
  deliberate step to take after you have registered.
- **Keep it on an internal network.** Nothing in the design assumes a public
  internet deployment.
