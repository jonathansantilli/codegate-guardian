import { strict as assert } from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { DrizzleChatRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/chat-repository";
import { DrizzleMessageRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/message-repository";
import { DrizzleStreamRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/stream-repository";
import { DrizzleUserRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/user-repository";
import { DrizzleVoteRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/vote-repository";
import {
  type PostgresHarness,
  startPostgresHarness,
} from "@/tests/helpers/testcontainer-pg";

describe("Feature: VoteRepository + StreamRepository (Drizzle-Postgres)", () => {
  let harness: PostgresHarness;
  let votes: DrizzleVoteRepository;
  let streams: DrizzleStreamRepository;
  let messages: DrizzleMessageRepository;
  let chats: DrizzleChatRepository;
  let users: DrizzleUserRepository;
  let chatId: string;
  let messageId: string;

  before(async () => {
    harness = await startPostgresHarness();
    votes = new DrizzleVoteRepository(harness.db);
    streams = new DrizzleStreamRepository(harness.db);
    messages = new DrizzleMessageRepository(harness.db);
    chats = new DrizzleChatRepository(harness.db);
    users = new DrizzleUserRepository(harness.db);
  });

  after(async () => {
    if (harness) await harness.stop();
  });

  beforeEach(async () => {
    await harness.resetDatabase();
    const guest = await users.createGuest({
      email: "vote-stream@example.com",
      passwordHash: "h",
    });
    chatId = "30000000-0000-0000-0000-000000000001";
    messageId = "40000000-0000-0000-0000-000000000001";
    await chats.save({
      id: chatId,
      userId: guest.id,
      title: "vs",
      visibility: "private",
    });
    await messages.save({
      messages: [
        {
          id: messageId,
          chatId,
          role: "assistant",
          parts: [],
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });
  });

  it("Given no vote, when cast('up') is called, then listByChat returns one upvote", async () => {
    await votes.cast({ chatId, messageId, type: "up" });
    const rows = await votes.listByChat(chatId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].isUpvoted, true);
  });

  it("Given an existing vote, when cast flips to 'down', then listByChat shows downvote with no new row", async () => {
    await votes.cast({ chatId, messageId, type: "up" });
    await votes.cast({ chatId, messageId, type: "down" });
    const rows = await votes.listByChat(chatId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].isUpvoted, false);
  });

  it("Given register is called twice, when listByChat runs, then both stream ids are returned in creation order", async () => {
    await streams.register({
      streamId: "50000000-0000-0000-0000-000000000001",
      chatId,
    });
    // Small delay so createdAt ordering is deterministic.
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    await streams.register({
      streamId: "50000000-0000-0000-0000-000000000002",
      chatId,
    });
    const ids = await streams.listByChat(chatId);
    assert.deepEqual(ids, [
      "50000000-0000-0000-0000-000000000001",
      "50000000-0000-0000-0000-000000000002",
    ]);
  });
});
