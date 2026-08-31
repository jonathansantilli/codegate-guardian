# Support

## Usage questions

Open a GitHub Discussion, or an issue if Discussions are not enabled yet.

Before you do, the README's [first run](README.md#first-run-step-by-step)
section answers most of what goes wrong on a new instance: the three required
environment variables, why registration closes behind the first operator, and
why nothing enrols until `AGENT_INGEST_TOKEN` is set.

## Bug reports

Use the bug report template and include:

- What you deployed — the compose stack, or your own arrangement
- The output of `docker compose ps` and, if the console is up, what
  **Activity** shows for the machine in question
- Whether the machine's check-in was refused, and with which reason — the
  console records every rejection with its cause, which is usually the answer

**Do not paste the contents of `.env`, an enrolment code, or a machine's
reporting token into an issue.** Redact them. A reporting token is a working
credential for that machine's identity on your fleet.

## Reporting conduct issues

Use GitHub's private vulnerability reporting on this repository
(**Security → Report a vulnerability**), which reaches the maintainers
privately. It is the same private channel used for security reports, and is
the contact path referred to by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Security vulnerabilities

Do not open an issue. See [SECURITY.md](SECURITY.md) for how to report
privately.

## What this project does not support

Guardian is a single-operator console by design: no roles, no user management,
no second account. That is a stated limit rather than a missing feature, and
requests to add multi-user access will be closed with a pointer to the
reasoning in the README.
