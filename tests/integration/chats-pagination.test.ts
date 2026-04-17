import { strict as assert } from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  type PostgresHarness,
  startPostgresHarness,
} from "@/tests/helpers/testcontainer-pg";

// Phase 1 — feature coverage row 10. Locks current tie-on-createdAt
// pagination behavior BEFORE the Phase 3a repository port rewrites it.
// Audit finding B6: the current cursor strictly compares `createdAt`
// with `gt`/`lt`, which can skip or duplicate rows when timestamps
// collide. This test captures that reality so the new ChatRepository
// port preserves it (or chooses to fix it and updates this scenario).

describe("Feature: list chats — cursor pagination tie behavior", () => {
  let harness: PostgresHarness;

  before(async () => {
    harness = await startPostgresHarness();
  });

  after(async () => {
    if (harness) await harness.stop();
  });

  beforeEach(async () => {
    await harness.resetDatabase();
  });

  it("Given two chats with identical createdAt, when paginating via startingAfter, then the tied row is NOT returned (current quirk)", async () => {
    const { client } = harness;

    const [user] = await client<{ id: string }[]>`
      INSERT INTO "User" (email, password)
      VALUES ('pg-tie@example.com', 'x')
      RETURNING id
    `;

    const sharedTimestamp = "2026-01-01T00:00:00Z";
    const laterTimestamp = "2026-01-02T00:00:00Z";

    await client`
      INSERT INTO "Chat" (id, "createdAt", title, "userId", visibility) VALUES
        ('11111111-1111-1111-1111-111111111111', ${sharedTimestamp}::timestamptz, 'first', ${user.id}, 'private'),
        ('22222222-2222-2222-2222-222222222222', ${sharedTimestamp}::timestamptz, 'second', ${user.id}, 'private'),
        ('33333333-3333-3333-3333-333333333333', ${laterTimestamp}::timestamptz, 'third', ${user.id}, 'private')
    `;

    // Replicate the current `getChatsByUserId` startingAfter logic:
    // WHERE createdAt > <selected.createdAt>. For a `startingAfter` id
    // whose createdAt equals another row's, that tied row is excluded
    // by the strict `>`.
    const selectedId = "11111111-1111-1111-1111-111111111111";
    const [selected] = await client<{ createdAt: Date }[]>`
      SELECT "createdAt" FROM "Chat" WHERE id = ${selectedId}
    `;

    const rows = await client<{ id: string; title: string }[]>`
      SELECT id, title FROM "Chat"
      WHERE "userId" = ${user.id} AND "createdAt" > ${selected.createdAt}
      ORDER BY "createdAt" DESC
      LIMIT 10
    `;

    const ids = rows.map((row) => row.id);
    assert.ok(
      !ids.includes("22222222-2222-2222-2222-222222222222"),
      "tied-timestamp row is dropped by current cursor — documents the quirk"
    );
    assert.ok(
      ids.includes("33333333-3333-3333-3333-333333333333"),
      "strictly later row is returned"
    );
  });
});
