import { and, eq } from "drizzle-orm";
import type {
  CastVoteInput,
  VoteRepository,
} from "@/src/application/ports/persistence/vote-repository";
import type { Vote } from "@/src/domain/chat/entities/vote";
import type { DrizzleDb } from "@/src/infrastructure/persistence/drizzle-postgres/client";
import { vote } from "@/src/infrastructure/persistence/drizzle-postgres/schema";

export class DrizzleVoteRepository implements VoteRepository {
  constructor(private readonly db: DrizzleDb) {}

  async cast(input: CastVoteInput): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(vote)
      .where(eq(vote.messageId, input.messageId));

    if (existing) {
      await this.db
        .update(vote)
        .set({ isUpvoted: input.type === "up" })
        .where(
          and(
            eq(vote.messageId, input.messageId),
            eq(vote.chatId, input.chatId)
          )
        );
      return;
    }

    await this.db.insert(vote).values({
      chatId: input.chatId,
      messageId: input.messageId,
      isUpvoted: input.type === "up",
    });
  }

  async listByChat(chatId: string): Promise<Vote[]> {
    return (await this.db
      .select()
      .from(vote)
      .where(eq(vote.chatId, chatId))) as Vote[];
  }
}
