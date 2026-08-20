import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
  name: text("name"),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  isAnonymous: boolean("isAnonymous").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

export const scanRun = pgTable(
  "ScanRun_v1",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    toolCallId: text("toolCallId").notNull(),
    toolName: varchar("toolName", {
      enum: ["analyzeConfig", "scanGithubRepo"],
    }).notNull(),
    mode: text("mode"),
    scanMode: varchar("scanMode", { enum: ["repository", "skills"] }),
    repositoryUrl: text("repositoryUrl"),
    selectedSkill: text("selectedSkill"),
    guessedPath: text("guessedPath"),
    findingsTotal: integer("findingsTotal").notNull().default(0),
    summaryBySeverity: json("summaryBySeverity").notNull(),
    rawOutput: json("rawOutput").notNull(),
    rawReport: json("rawReport").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    messageToolCallKey: unique("ScanRun_v1_message_tool_call_key").on(
      table.messageId,
      table.toolCallId
    ),
    chatIdx: index("ScanRun_v1_chat_idx").on(table.chatId),
    messageIdx: index("ScanRun_v1_message_idx").on(table.messageId),
  })
);

export type ScanRun = InferSelectModel<typeof scanRun>;

export const scanFinding = pgTable(
  "ScanFinding_v1",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    scanRunId: uuid("scanRunId")
      .notNull()
      .references(() => scanRun.id, { onDelete: "cascade" }),
    findingId: text("findingId").notNull(),
    ruleId: text("ruleId"),
    severity: varchar("severity", {
      enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"],
    }).notNull(),
    category: text("category"),
    layer: text("layer"),
    filePath: text("filePath"),
    description: text("description").notNull(),
    evidence: text("evidence"),
    owasp: json("owasp").notNull(),
    cwe: text("cwe"),
    confidence: text("confidence"),
    fixable: boolean("fixable"),
    rawFinding: json("rawFinding").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    scanRunFindingKey: unique("ScanFinding_v1_scan_run_finding_key").on(
      table.scanRunId,
      table.findingId
    ),
    scanRunIdx: index("ScanFinding_v1_scan_run_idx").on(table.scanRunId),
    severityIdx: index("ScanFinding_v1_severity_idx").on(table.severity),
  })
);

export type ScanFinding = InferSelectModel<typeof scanFinding>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.chatId, table.messageId] }),
  })
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
  })
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;
