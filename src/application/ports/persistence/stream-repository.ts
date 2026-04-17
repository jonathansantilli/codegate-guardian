export type StreamRepository = {
  register(input: { streamId: string; chatId: string }): Promise<void>;
  listByChat(chatId: string): Promise<string[]>;
};
