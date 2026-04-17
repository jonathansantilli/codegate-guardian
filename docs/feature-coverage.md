# Feature coverage audit

Living document. Tracks every feature in §4 of `docs/decouple-vercel.md`
and its current test coverage. Updated by each phase as scenarios are
added.

Legend:

- ✅ Covered — at least one automated test exercises this behavior.
- 🟡 Partial — some behavior covered, important branches missing.
- ❌ Gap — no automated coverage today.
- ⏸️ Deferred — covered by a later phase that will rebuild this feature.

Phase column: the phase expected to close the gap (or the phase that
already covers it).

---

## Chat & messaging

| # | Feature | Status | Current coverage | Gap / plan |
|---|---|---|---|---|
| 1 | Send message, stream assistant reply | ✅ | `tests/e2e/api.test.ts` "sends message and receives AI response" | — |
| 2 | Tool approval / deny replay | ❌ | none | Phase 5 (use case `continue-approved-tool-call`) |
| 3 | Resumable stream (Redis present) | ❌ | none | Phase 5 |
| 4 | Resumable stream bootstrap endpoint (204) | ❌ | none | Phase 5 |
| 5 | Client drop + reconnect | ❌ | none | Phase 5 |
| 6 | `data-chat-title` stream event | 🟡 | implicit in `api.test.ts` (URL redirects) | Phase 5 explicit test |
| 7 | Chat title autogeneration | ❌ | none | Phase 5 |
| 8 | Per-user hourly message cap | ❌ | none | Phase 5 |
| 9 | Per-IP rate limit | ❌ | none | Phase 8 |
| 10 | List chats with cursor pagination (tie behavior) | 🟡 | `tests/integration/chats-pagination.test.ts` (tie-quirk) + `tests/integration/chat-repository.test.ts` (pagination semantics) | Phase 5 adds E2E over the use case |
| 11 | Delete chat (cascades) | 🟡 | `tests/integration/chat-repository.test.ts` "deleteById removes one" | Phase 5 adds E2E |
| 12 | Delete all chats for user | 🟡 | `tests/integration/chat-repository.test.ts` "deleteAllForUser" | Phase 5 adds E2E |
| 13 | Update chat visibility | 🟡 | `tests/integration/chat-repository.test.ts` "updateVisibility flips to public" | Phase 5 adds E2E |
| 14 | Update chat title (manual) | 🟡 | `tests/integration/chat-repository.test.ts` "updateTitle" | Phase 5 adds E2E |
| 15 | Message voting | 🟡 | `tests/integration/vote-stream-repository.test.ts` (cast + flip) | Phase 5 adds E2E |
| 16 | Edit / retry (delete messages after ts) | 🟡 | `tests/integration/message-repository.test.ts` "deleteAfter" | Phase 5 adds E2E |
| 17 | Slash commands | ❌ | none | Phase 1 (stable UI) |
| 18 | Visibility selector | ❌ | none | Phase 5 (paired with use case #13) |
| 19 | Suggested actions | ✅ | `tests/e2e/api.test.ts` "suggested actions are clickable" | — |
| 20 | Sidebar toggle persistence | ❌ | none | Phase 1 (stable UI) |
| 21 | Sidebar history pagination | ❌ | none | Phase 5 |

## Scan & reporting

| # | Feature | Status | Current coverage | Gap / plan |
|---|---|---|---|---|
| 22 | Tool `analyzeConfig` | ✅ | `tests/unit/analyze-config.test.ts` + `tests/unit/codegate-cli.test.ts` | Phase 10 adds adapter integration test |
| 23 | Tool `scanGithubRepo` + skill flow | ✅ | `tests/unit/scan-github-repo.test.ts` | Phase 10 integration |
| 24 | Scan run + finding persistence | ❌ | none | Phase 3c |
| 25 | Reporting overview | ✅ | `tests/unit/reporting-overview.test.ts` | Phase 2 (domain) |
| 26 | Finding detail | ✅ | `tests/unit/report-finding-detail.test.ts` | Phase 2 (domain) |
| 27 | Hackathon mode | ✅ | `tests/unit/hackathon-mode.test.ts` | — |
| 28 | `/scan` page route | ❌ | none | Phase 1 (stable) |
| 29 | Scan report view | ✅ | `tests/unit/scan-report-view.test.ts` | — |
| 30 | GitHub source link | ✅ | `tests/unit/github-source-link.test.ts` | — |
| 31 | Shell view | ✅ | `tests/unit/shell-view.test.ts` | — |

## Artifacts & documents

| # | Feature | Status | Current coverage | Gap / plan |
|---|---|---|---|---|
| 32 | Artifact document — text | ❌ | none | Phase 5 |
| 33 | Artifact document — code | ❌ | none | Phase 5 |
| 34 | Artifact document — sheet | ❌ | none | Phase 5 |
| 35 | Artifact document — image (dead code?) | ❌ | none | Phase 13 (decision: delete if unused) |
| 36 | Document streaming context | ❌ | none | Phase 5 |
| 37 | Save document | 🟡 | `tests/integration/artifact-repository.test.ts` "save called twice" | Phase 5 adds E2E |
| 38 | Update document content | 🟡 | `tests/integration/artifact-repository.test.ts` "updateLatestContent" + missing-doc rejection | Phase 5 adds E2E |
| 39 | List document versions | 🟡 | `tests/integration/artifact-repository.test.ts` "listVersions" | Phase 5 adds E2E |
| 40 | Delete document versions after ts | 🟡 | `tests/integration/artifact-repository.test.ts` "deleteAfter cascades to suggestions" | Phase 5 adds E2E |
| 41 | Save suggestions | 🟡 | `tests/integration/artifact-repository.test.ts` "suggestions save + listByDocumentId" | Phase 5 adds E2E |
| 42 | List suggestions | 🟡 | `tests/integration/artifact-repository.test.ts` "suggestions save + listByDocumentId" | Phase 5 adds E2E |
| 43 | `/api/document` route | ❌ | none | Phase 5 |
| 44 | `/api/suggestions` route | ❌ | none | Phase 5 |

## Auth, identity, files

| # | Feature | Status | Current coverage | Gap / plan |
|---|---|---|---|---|
| 45 | Email/password login | 🟡 | `tests/e2e/auth.test.ts` (page render + navigation only) | Phase 11 (end-to-end login flow) |
| 46 | User registration | 🟡 | `tests/e2e/auth.test.ts` (page render only) | Phase 11 |
| 47 | Guest user auto-provision | ❌ | none | Phase 11 |
| 48 | Middleware (`proxy.ts`): guest redirect, `/login`, `/register`, `/ping` | ❌ | none | Phase 1 (`/ping`) + Phase 11 (redirects) |
| 49 | File upload (images) | ❌ | none | ⏸️ Phase 6 (response shape changes, A3) |
| 50 | Stranded Vercel Blob URLs | — | n/a (A1: accepted loss) | — |

## Models, capabilities, telemetry, API

| # | Feature | Status | Current coverage | Gap / plan |
|---|---|---|---|---|
| 51 | Model selector & capabilities | ✅ | `tests/e2e/model-selector.test.ts` + `tests/unit/providers.test.ts` | Phase 4 updates (gateway models dropped) |
| 52 | Direct Gemini provider | ✅ | `tests/unit/providers.test.ts` | Phase 4 |
| 53 | Local CLI models (Claude Code, Codex) | 🟡 | `tests/unit/providers.test.ts` resolution; no adapter test | Phase 4 integration |
| 54 | `getWeather` tool | ❌ | none | Phase 4 (thin delegate; trivial test) |
| 55 | `ChatbotError` → HTTP | ❌ | none | Phase 5 (error-presenter service) |
| 56 | Theme handling | ✅ | `tests/unit/theme-color.test.ts` | — |
| 57 | `/api/messages` | ❌ | none | Phase 5 |
| 58 | `/api/history` | ❌ | none | Phase 5 |
| 59 | `/api/vote` | ❌ | none | Phase 5 |

---

## Summary

- **Covered (✅):** 13 features — 22% of the surface.
- **Partial (🟡):** 4 features — needs deeper scenarios in later phases.
- **Gaps closing this phase (Phase 1):** 5 features — `/ping` (48), slash
  commands (17), sidebar toggle (20), `/scan` page (28), pagination
  behavior (10). Stable UI / stable endpoints only.
- **Gaps deferred (⏸️):** 1 feature (upload #49) — coverage added in the
  phase that rebuilds it, not before, since the response shape changes.
- **Majority of gaps close in Phase 5** — as expected; that phase
  consolidates all use cases, so scenarios land with the
  implementations.

Every later phase updates this document in the same PR that closes the
gap. Reviewers check that the status column flips from ❌/🟡 to ✅ for
the row the PR touches.
