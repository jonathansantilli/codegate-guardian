import { strict as assert } from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { DrizzleChatRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/chat-repository";
import { DrizzleMessageRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/message-repository";
import { DrizzleUserRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/user-repository";
import {
  type PostgresHarness,
  startPostgresHarness,
} from "@/tests/helpers/testcontainer-pg";

describe("Feature: MessageRepository (Drizzle-Postgres)", () => {
  let harness: PostgresHarness;
  let messages: DrizzleMessageRepository;
  let chats: DrizzleChatRepository;
  let users: DrizzleUserRepository;
  let userId: string;
  let chatId: string;

  before(async () => {
    harness = await startPostgresHarness();
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
      email: "msg-fixture@example.com",
      passwordHash: "h",
    });
    userId = guest.id;
    chatId = "10000000-0000-0000-0000-000000000001";
    await chats.save({
      id: chatId,
      userId,
      title: "msg chat",
      visibility: "private",
    });
  });

  it("Given save then listByChat, when inserted in one batch, then all messages are returned in creation order", async () => {
    const now = new Date();
    await messages.save({
      messages: [
        {
          id: "20000000-0000-0000-0000-000000000001",
          chatId,
          role: "user",
          parts: [{ type: "text", text: "hello" }],
          attachments: [],
          createdAt: new Date(now.getTime() - 100),
        },
        {
          id: "20000000-0000-0000-0000-000000000002",
          chatId,
          role: "assistant",
          parts: [{ type: "text", text: "hi" }],
          attachments: [],
          createdAt: now,
        },
      ],
    });
    const rows = await messages.listByChat(chatId);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].role, "user");
    assert.equal(rows[1].role, "assistant");
  });

  it("Given update, when parts change, then findById returns the updated parts", async () => {
    await messages.save({
      messages: [
        {
          id: "20000000-0000-0000-0000-00000000000a",
          chatId,
          role: "user",
          parts: [{ type: "text", text: "before" }],
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });
    await messages.update({
      id: "20000000-0000-0000-0000-00000000000a",
      parts: [{ type: "text", text: "after" }],
    });
    const rows = await messages.findById(
      "20000000-0000-0000-0000-00000000000a"
    );
    assert.deepEqual(rows[0].parts, [{ type: "text", text: "after" }]);
  });

  it("Given recent user messages, when countRecentUserMessages runs, then assistant messages are excluded", async () => {
    const now = new Date();
    await messages.save({
      messages: [
        {
          id: "20000000-0000-0000-0000-00000000000b",
          chatId,
          role: "user",
          parts: [],
          attachments: [],
          createdAt: now,
        },
        {
          id: "20000000-0000-0000-0000-00000000000c",
          chatId,
          role: "assistant",
          parts: [],
          attachments: [],
          createdAt: now,
        },
      ],
    });
    const n = await messages.countRecentUserMessages({
      userId,
      sinceHours: 1,
    });
    assert.equal(n, 1);
  });

  it("Given deleteAfter, when called with a timestamp, then only messages at or after it disappear", async () => {
    const base = new Date("2026-01-01T00:00:00Z");
    await messages.save({
      messages: [
        {
          id: "20000000-0000-0000-0000-0000000000d1",
          chatId,
          role: "user",
          parts: [],
          attachments: [],
          createdAt: new Date(base.getTime() - 1000),
        },
        {
          id: "20000000-0000-0000-0000-0000000000d2",
          chatId,
          role: "user",
          parts: [],
          attachments: [],
          createdAt: base,
        },
      ],
    });
    await messages.deleteAfter({ chatId, timestamp: base });
    const rows = await messages.listByChat(chatId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "20000000-0000-0000-0000-0000000000d1");
  });
});
