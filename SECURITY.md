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
2. Email: `jonathansantilli@gmail.com` with:
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
- **`AGENT_INGEST_TOKEN` opens enrolment.** Its absence closes the ingest
  endpoint entirely. Rotate it by restarting with a new value; machines that
  have already enrolled keep reporting with their own per-machine tokens.
- **Each machine reports with its own token.** A report is attributed to the
  machine whose token signed it, never to the `machineId` in the payload, so a
  compromised agent cannot resolve or forge another machine's findings.
- **Revoke a machine from Access** when a laptop is lost or rebuilt. A revoked
  token is refused at ingest and the rejection is recorded.
- **Serve it over TLS.** Session cookies and agent tokens both cross the wire;
  the proxy expects the scheme it issued cookies under.
- **Keep it on an internal network.** Nothing in the design assumes a public
  internet deployment.
