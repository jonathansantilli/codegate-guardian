import type { Chat, ChatVisibility } from "@/src/domain/chat/entities/chat";

export type SaveChatInput = {
  id: string;
  userId: string;
  title: string;
  visibility: ChatVisibility;
};

export type ListChatsInput = {
  userId: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
};

export type ListChatsResult = {
  chats: Chat[];
  hasMore: boolean;
};

export type ChatRepository = {
  save(input: SaveChatInput): Promise<void>;
  findById(id: string): Promise<Chat | null>;
  listByUser(input: ListChatsInput): Promise<ListChatsResult>;
  deleteById(id: string): Promise<Chat | null>;
  deleteAllForUser(userId: string): Promise<{ deletedCount: number }>;
  updateVisibility(id: string, visibility: ChatVisibility): Promise<void>;
  updateTitle(id: string, title: string): Promise<void>;
};
