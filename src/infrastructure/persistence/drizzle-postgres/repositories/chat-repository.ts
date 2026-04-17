import { and, desc, eq, gt, inArray, lt, type SQL } from "drizzle-orm";
import type {
  ChatRepository,
  ListChatsInput,
  ListChatsResult,
  SaveChatInput,
} from "@/src/application/ports/persistence/chat-repository";
import type { Chat, ChatVisibility } from "@/src/domain/chat/entities/chat";
import type { DrizzleDb } from "@/src/infrastructure/persistence/drizzle-postgres/client";
import {
  chat,
  message,
  stream,
  vote,
} from "@/src/infrastructure/persistence/drizzle-postgres/schema";

export class DrizzleChatRepository implements ChatRepository {
  constructor(private readonly db: DrizzleDb) {}

  async save(input: SaveChatInput): Promise<void> {
    await this.db.insert(chat).values({
      id: input.id,
      userId: input.userId,
      title: input.title,
      visibility: input.visibility,
      createdAt: new Date(),
    });
  }

  async findById(id: string): Promise<Chat | null> {
    const [row] = await this.db.select().from(chat).where(eq(chat.id, id));
    return row ? (row as Chat) : null;
  }

  async listByUser(input: ListChatsInput): Promise<ListChatsResult> {
    const extendedLimit = input.limit + 1;

    const query = (whereCondition?: SQL<unknown>) =>
      this.db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, input.userId))
            : eq(chat.userId, input.userId)
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let rows: Chat[] = [];

    if (input.startingAfter) {
      const [selected] = await this.db
        .select()
        .from(chat)
        .where(eq(chat.id, input.startingAfter))
        .limit(1);
      if (!selected) return { chats: [], hasMore: false };
      rows = (await query(gt(chat.createdAt, selected.createdAt))) as Chat[];
    } else if (input.endingBefore) {
      const [selected] = await this.db
        .select()
        .from(chat)
        .where(eq(chat.id, input.endingBefore))
        .limit(1);
      if (!selected) return { chats: [], hasMore: false };
      rows = (await query(lt(chat.createdAt, selected.createdAt))) as Chat[];
    } else {
      rows = (await query()) as Chat[];
    }

    const hasMore = rows.length > input.limit;
    return {
      chats: hasMore ? rows.slice(0, input.limit) : rows,
      hasMore,
    };
  }

  async deleteById(id: string): Promise<Chat | null> {
    await this.db.delete(vote).where(eq(vote.chatId, id));
    await this.db.delete(message).where(eq(message.chatId, id));
    await this.db.delete(stream).where(eq(stream.chatId, id));

    const [deleted] = await this.db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return deleted ? (deleted as Chat) : null;
  }

  async deleteAllForUser(userId: string): Promise<{ deletedCount: number }> {
    const userChats = await this.db
      .select({ id: chat.id })
      .from(chat)
      .where(eq(chat.userId, userId));

    if (userChats.length === 0) {
      return { deletedCount: 0 };
    }

    const chatIds = userChats.map((row) => row.id);

    await this.db.delete(vote).where(inArray(vote.chatId, chatIds));
    await this.db.delete(message).where(inArray(message.chatId, chatIds));
    await this.db.delete(stream).where(inArray(stream.chatId, chatIds));

    const deletedChats = await this.db
      .delete(chat)
      .where(eq(chat.userId, userId))
      .returning();

    return { deletedCount: deletedChats.length };
  }

  async updateVisibility(
    id: string,
    visibility: ChatVisibility
  ): Promise<void> {
    await this.db.update(chat).set({ visibility }).where(eq(chat.id, id));
  }

  async updateTitle(id: string, title: string): Promise<void> {
    await this.db.update(chat).set({ title }).where(eq(chat.id, id));
  }
}
