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
    assert.ok(
      names.includes("User"),
      "User table should exist after migrations"
    );
    assert.ok(
      names.includes("Chat"),
      "Chat table should exist after migrations"
    );
    assert.ok(
      names.includes("ScanRun_v1"),
      "ScanRun_v1 table should exist after migrations"
    );
  });

  it("resetDatabase truncates user data without dropping schema", async () => {
    await harness.client`
      INSERT INTO "User" (email, password) VALUES ('harness-test@example.com', 'x')
    `;
    const [beforeReset] = await harness.client<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM "User"
    `;
    assert.equal(beforeReset.count, 1);

    await harness.resetDatabase();

    const [afterReset] = await harness.client<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM "User"
    `;
    assert.equal(afterReset.count, 0);

    const tables = await harness.client<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;
    assert.ok(tables.length > 0, "schema must survive reset");
  });
});
