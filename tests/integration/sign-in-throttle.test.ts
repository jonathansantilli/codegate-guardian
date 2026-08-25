import { strict as assert } from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { DrizzleSignInAttemptRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/sign-in-attempt-repository";
import {
  type PostgresHarness,
  startPostgresHarness,
} from "@/tests/helpers/testcontainer-pg";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const NOW = new Date("2026-08-20T12:00:00Z");
const OPERATOR = "operator@acme.test";

describe("Feature: guessing at an operator's password is bounded", () => {
  let harness: PostgresHarness;
  let attempts: DrizzleSignInAttemptRepository;

  before(async () => {
    harness = await startPostgresHarness();
    attempts = new DrizzleSignInAttemptRepository(
      harness.db,
      WINDOW_MS,
      MAX_FAILURES
    );
  });

  after(async () => {
    await harness.stop();
  });

  beforeEach(async () => {
    await harness.resetDatabase();
  });

  it("Given no history, when an address signs in, then it is not throttled", async () => {
    assert.equal(await attempts.isThrottled(OPERATOR, NOW), false);
  });

  it("Given fewer failures than the limit, when checked, then it is still allowed", async () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) {
      await attempts.recordFailure(OPERATOR, NOW);
    }

    assert.equal(await attempts.isThrottled(OPERATOR, NOW), false);
  });

  it("Given the limit is reached, when checked, then further attempts are refused", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) {
      await attempts.recordFailure(OPERATOR, NOW);
    }

    assert.equal(await attempts.isThrottled(OPERATOR, NOW), true);
  });

  // Read-then-write would let every concurrent attempt read the same count
  // and each write one more than it, which is how a limit stops limiting.
  it("Given concurrent failures, when they are counted, then none are lost", async () => {
    await Promise.all(
      Array.from({ length: MAX_FAILURES }, () =>
        attempts.recordFailure(OPERATOR, NOW)
      )
    );

    assert.equal(await attempts.isThrottled(OPERATOR, NOW), true);
  });

  it("Given one address is locked out, when another signs in, then it is unaffected", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) {
      await attempts.recordFailure(OPERATOR, NOW);
    }

    assert.equal(
      await attempts.isThrottled("someone-else@acme.test", NOW),
      false
    );
  });

  it("Given the window has passed, when the address tries again, then it is allowed", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) {
      await attempts.recordFailure(OPERATOR, NOW);
    }

    const later = new Date(NOW.getTime() + WINDOW_MS);

    assert.equal(await attempts.isThrottled(OPERATOR, later), false);
  });

  it("Given a successful sign-in, when the count is cleared, then the address is allowed again", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) {
      await attempts.recordFailure(OPERATOR, NOW);
    }
    await attempts.clear(OPERATOR);

    assert.equal(await attempts.isThrottled(OPERATOR, NOW), false);
  });

  // The address is a person's typing, not a key.
  it("Given the same address in different case, when counted, then it is one address", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) {
      await attempts.recordFailure("  OPERATOR@Acme.TEST ", NOW);
    }

    assert.equal(await attempts.isThrottled(OPERATOR, NOW), true);
  });
});
