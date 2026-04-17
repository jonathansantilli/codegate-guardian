import { asc, eq } from "drizzle-orm";
import type { StreamRepository } from "@/src/application/ports/persistence/stream-repository";
import type { DrizzleDb } from "@/src/infrastructure/persistence/drizzle-postgres/client";
import { stream } from "@/src/infrastructure/persistence/drizzle-postgres/schema";

export class DrizzleStreamRepository implements StreamRepository {
  constructor(private readonly db: DrizzleDb) {}

  async register(input: { streamId: string; chatId: string }): Promise<void> {
    await this.db.insert(stream).values({
      id: input.streamId,
      chatId: input.chatId,
      createdAt: new Date(),
    });
  }

  async listByChat(chatId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();
    return rows.map((row) => row.id);
  }
}
