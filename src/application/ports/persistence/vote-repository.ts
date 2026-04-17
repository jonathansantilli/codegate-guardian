import type { Vote } from "@/src/domain/chat/entities/vote";

export type CastVoteInput = {
  chatId: string;
  messageId: string;
  type: "up" | "down";
};

export type VoteRepository = {
  cast(input: CastVoteInput): Promise<void>;
  listByChat(chatId: string): Promise<Vote[]>;
};
