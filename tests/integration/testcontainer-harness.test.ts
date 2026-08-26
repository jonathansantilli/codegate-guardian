import { strict as assert } from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  type PostgresHarness,
  startPostgresHarness,
} from "@/tests/helpers/testcontainer-pg";

// Smoke integration test for the testcontainer harness. This is the
// canary that proves Phase 1's infrastructure is wired correctly. Every
// later adapter integration test follows this same beforeAll/afterAll
// pattern.
describe("testcontainer-pg harness", () => {
  let harness: PostgresHarness;

  before(async () => {
    harness = await startPostgresHarness();
  });

  after(async () => {
    if (harness) await harness.stop();
  });

  it("boots postgres and runs migrations", async () => {
    const tables = await harness.client<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
        ORDER BY tablename
    `;
    const names = tables.map((row) => row.tablename);

    // The tables the console actually needs, so a broken migration chain
    // fails here rather than at the first check-in.
    for (const table of [
      "User_v1",
      "Host_v1",
      "HostReport_v1",
      "HostInventoryItem_v1",
      "HostFinding_v1",
      "FindingAcknowledgement_v1",
      "FindingSuppression_v1",
      "EnrolmentCode_v1",
      "ActivityEvent_v1",
      "Policy_v1",
    ]) {
      assert.ok(
        names.includes(table),
        `${table} should exist after migrations`
      );
    }

    // And the ones the chat application owned, which migration 0009 drops.
    // A fresh database must not carry them, or the drop silently did nothing.
    for (const table of [
      "Chat",
      "Message_v2",
      "Vote_v2",
      "Document",
      "Suggestion",
      "Stream",
      "ScanRun_v1",
      "ScanFinding_v1",
    ]) {
      assert.ok(
        !names.includes(table),
        `${table} should be gone after migrations`
      );
    }
  });

  it("resetDatabase truncates user data without dropping schema", async () => {
    await harness.client`
      INSERT INTO "User_v1" (email, password) VALUES ('harness-test@example.com', 'x')
    `;
    const [beforeReset] = await harness.client<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM "User_v1"
    `;
    assert.equal(beforeReset.count, 1);

    await harness.resetDatabase();

    const [afterReset] = await harness.client<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM "User_v1"
    `;
    assert.equal(afterReset.count, 0);

    const tables = await harness.client<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;
    assert.ok(tables.length > 0, "schema must survive reset");
  });
});
