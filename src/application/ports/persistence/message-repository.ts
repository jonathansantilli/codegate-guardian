import type { Message } from "@/src/domain/chat/entities/message";

export type SaveMessagesInput = {
  messages: Message[];
};

export type UpdateMessageInput = {
  id: string;
  parts: unknown;
};

export type CountRecentUserMessagesInput = {
  userId: string;
  sinceHours: number;
};

export type DeleteMessagesAfterInput = {
  chatId: string;
  timestamp: Date;
};

export type MessageRepository = {
  save(input: SaveMessagesInput): Promise<void>;
  update(input: UpdateMessageInput): Promise<void>;
  listByChat(chatId: string): Promise<Message[]>;
  findById(id: string): Promise<Message[]>;
  countRecentUserMessages(
    input: CountRecentUserMessagesInput
  ): Promise<number>;
  deleteAfter(input: DeleteMessagesAfterInput): Promise<void>;
};
