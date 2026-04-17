import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import type {
  CountRecentUserMessagesInput,
  DeleteMessagesAfterInput,
  MessageRepository,
  SaveMessagesInput,
  UpdateMessageInput,
} from "@/src/application/ports/persistence/message-repository";
import type { Message } from "@/src/domain/chat/entities/message";
import type { DrizzleDb } from "@/src/infrastructure/persistence/drizzle-postgres/client";
import {
  chat,
  message,
  vote,
} from "@/src/infrastructure/persistence/drizzle-postgres/schema";

export class DrizzleMessageRepository implements MessageRepository {
  constructor(private readonly db: DrizzleDb) {}

  async save(input: SaveMessagesInput): Promise<void> {
    if (input.messages.length === 0) return;
    await this.db.insert(message).values(
      input.messages.map((m) => ({
        id: m.id,
        chatId: m.chatId,
        role: m.role,
        parts: m.parts,
        attachments: m.attachments,
        createdAt: m.createdAt,
      }))
    );
  }

  async update(input: UpdateMessageInput): Promise<void> {
    await this.db
      .update(message)
      .set({ parts: input.parts })
      .where(eq(message.id, input.id));
  }

  async listByChat(chatId: string): Promise<Message[]> {
    return (await this.db
      .select()
      .from(message)
      .where(eq(message.chatId, chatId))
      .orderBy(asc(message.createdAt))) as Message[];
  }

  async findById(id: string): Promise<Message[]> {
    return (await this.db
      .select()
      .from(message)
      .where(eq(message.id, id))) as Message[];
  }

  async countRecentUserMessages(
    input: CountRecentUserMessagesInput
  ): Promise<number> {
    const cutoff = new Date(Date.now() - input.sinceHours * 60 * 60 * 1000);
    const [stats] = await this.db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, input.userId),
          gte(message.createdAt, cutoff),
          eq(message.role, "user")
        )
      )
      .execute();
    return stats?.count ?? 0;
  }

  async deleteAfter(input: DeleteMessagesAfterInput): Promise<void> {
    const messagesToDelete = await this.db
      .select({ id: message.id })
      .from(message)
      .where(
        and(
          eq(message.chatId, input.chatId),
          gte(message.createdAt, input.timestamp)
        )
      );

    const ids = messagesToDelete.map((row) => row.id);
    if (ids.length === 0) return;

    await this.db
      .delete(vote)
      .where(and(eq(vote.chatId, input.chatId), inArray(vote.messageId, ids)));
    await this.db
      .delete(message)
      .where(and(eq(message.chatId, input.chatId), inArray(message.id, ids)));
  }
}
