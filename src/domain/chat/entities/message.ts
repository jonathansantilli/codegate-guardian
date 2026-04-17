export type MessageRole = string;

export type Message = {
  id: string;
  chatId: string;
  role: MessageRole;
  parts: unknown;
  attachments: unknown;
  createdAt: Date;
};
