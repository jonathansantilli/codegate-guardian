import { strict as assert } from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { DrizzleUserRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/user-repository";
import {
  type PostgresHarness,
  startPostgresHarness,
} from "@/tests/helpers/testcontainer-pg";

describe("Feature: UserRepository (Drizzle-Postgres)", () => {
  let harness: PostgresHarness;
  let repository: DrizzleUserRepository;

  before(async () => {
    harness = await startPostgresHarness();
    repository = new DrizzleUserRepository(harness.db);
  });

  after(async () => {
    if (harness) await harness.stop();
  });

  beforeEach(async () => {
    await harness.resetDatabase();
  });

  it("Given no matching user, when findByEmail is called, then an empty array is returned", async () => {
    const users = await repository.findByEmail("does-not-exist@example.com");
    assert.deepEqual(users, []);
  });

  it("Given create is called, when findByEmail runs afterwards, then the inserted user is returned", async () => {
    await repository.create({
      email: "persisted@example.com",
      passwordHash: "hashed:pw",
    });

    const users = await repository.findByEmail("persisted@example.com");
    assert.equal(users.length, 1);
    assert.equal(users[0].email, "persisted@example.com");
    assert.equal(users[0].password, "hashed:pw");
  });
});
