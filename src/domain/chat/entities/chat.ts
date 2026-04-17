export type ChatVisibility = "public" | "private";

export type Chat = {
  id: string;
  createdAt: Date;
  title: string;
  userId: string;
  visibility: ChatVisibility;
};
