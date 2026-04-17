import { strict as assert } from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { DrizzleChatRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/chat-repository";
import { DrizzleUserRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/user-repository";
import {
  type PostgresHarness,
  startPostgresHarness,
} from "@/tests/helpers/testcontainer-pg";

describe("Feature: ChatRepository (Drizzle-Postgres)", () => {
  let harness: PostgresHarness;
  let repository: DrizzleChatRepository;
  let users: DrizzleUserRepository;
  let userId: string;

  before(async () => {
    harness = await startPostgresHarness();
    repository = new DrizzleChatRepository(harness.db);
    users = new DrizzleUserRepository(harness.db);
  });

  after(async () => {
    if (harness) await harness.stop();
  });

  beforeEach(async () => {
    await harness.resetDatabase();
    const guest = await users.createGuest({
      email: "chat-fixture@example.com",
      passwordHash: "hash",
    });
    userId = guest.id;
  });

  it("Given save is called, when findById runs, then the chat is returned", async () => {
    await repository.save({
      id: "00000000-0000-0000-0000-000000000001",
      userId,
      title: "First scan",
      visibility: "private",
    });
    const found = await repository.findById(
      "00000000-0000-0000-0000-000000000001"
    );
    assert.ok(found);
    assert.equal(found?.title, "First scan");
    assert.equal(found?.visibility, "private");
  });

  it("Given three chats, when listByUser is called with limit 2, then hasMore is true and only two are returned", async () => {
    for (let i = 1; i <= 3; i++) {
      await repository.save({
        id: `00000000-0000-0000-0000-00000000000${i}`,
        userId,
        title: `chat ${i}`,
        visibility: "private",
      });
    }
    const page = await repository.listByUser({
      userId,
      limit: 2,
      startingAfter: null,
      endingBefore: null,
    });
    assert.equal(page.chats.length, 2);
    assert.equal(page.hasMore, true);
  });

  it("Given a chat, when updateVisibility flips it to public, then findById reflects the change", async () => {
    await repository.save({
      id: "00000000-0000-0000-0000-000000000010",
      userId,
      title: "vis test",
      visibility: "private",
    });
    await repository.updateVisibility(
      "00000000-0000-0000-0000-000000000010",
      "public"
    );
    const found = await repository.findById(
      "00000000-0000-0000-0000-000000000010"
    );
    assert.equal(found?.visibility, "public");
  });

  it("Given a chat, when updateTitle changes the title, then findById returns the new title", async () => {
    await repository.save({
      id: "00000000-0000-0000-0000-000000000011",
      userId,
      title: "original",
      visibility: "private",
    });
    await repository.updateTitle(
      "00000000-0000-0000-0000-000000000011",
      "renamed"
    );
    const found = await repository.findById(
      "00000000-0000-0000-0000-000000000011"
    );
    assert.equal(found?.title, "renamed");
  });

  it("Given two chats, when deleteById removes one, then the other remains", async () => {
    await repository.save({
      id: "00000000-0000-0000-0000-000000000020",
      userId,
      title: "keep",
      visibility: "private",
    });
    await repository.save({
      id: "00000000-0000-0000-0000-000000000021",
      userId,
      title: "drop",
      visibility: "private",
    });
    const deleted = await repository.deleteById(
      "00000000-0000-0000-0000-000000000021"
    );
    assert.equal(deleted?.title, "drop");
    assert.equal(
      await repository.findById("00000000-0000-0000-0000-000000000021"),
      null
    );
    assert.ok(
      await repository.findById("00000000-0000-0000-0000-000000000020")
    );
  });

  it("Given two chats for a user, when deleteAllForUser is called, then both are removed", async () => {
    await repository.save({
      id: "00000000-0000-0000-0000-000000000030",
      userId,
      title: "a",
      visibility: "private",
    });
    await repository.save({
      id: "00000000-0000-0000-0000-000000000031",
      userId,
      title: "b",
      visibility: "private",
    });
    const result = await repository.deleteAllForUser(userId);
    assert.equal(result.deletedCount, 2);
    const page = await repository.listByUser({
      userId,
      limit: 10,
      startingAfter: null,
      endingBefore: null,
    });
    assert.equal(page.chats.length, 0);
  });
});
