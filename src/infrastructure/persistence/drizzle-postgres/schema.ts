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

// --- Fleet: machines running the codegate agent -----------------------------

export const host = pgTable(
  "Host_v1",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    // Agent-generated and stable for the life of the machine. Hostnames are
    // neither unique across an org nor stable, so they are display data only.
    machineId: text("machineId").notNull(),
    hostname: text("hostname").notNull(),
    platform: text("platform"),
    osRelease: text("osRelease"),
    username: text("username"),
    owner: text("owner"),
    team: text("team"),
    agentVersion: text("agentVersion"),
    firstSeenAt: timestamp("firstSeenAt").notNull(),
    lastSeenAt: timestamp("lastSeenAt").notNull(),
  },
  (table) => ({
    machineIdKey: unique("Host_v1_machine_id_key").on(table.machineId),
    lastSeenIdx: index("Host_v1_last_seen_idx").on(table.lastSeenAt),
  })
);

export type Host = InferSelectModel<typeof host>;

export const hostReport = pgTable(
  "HostReport_v1",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    hostId: uuid("hostId")
      .notNull()
      .references(() => host.id, { onDelete: "cascade" }),
    receivedAt: timestamp("receivedAt").notNull(),
    collectedAt: timestamp("collectedAt").notNull(),
    kbVersion: text("kbVersion"),
    itemsTotal: integer("itemsTotal").notNull().default(0),
    // Whether this report carried a findings list at all. An inventory-only
    // report asserts nothing about findings, so it must not resolve any.
    findingsReported: boolean("findingsReported").notNull().default(false),
    toolsDetected: json("toolsDetected").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    hostIdx: index("HostReport_v1_host_idx").on(table.hostId),
    hostReceivedIdx: index("HostReport_v1_host_received_idx").on(
      table.hostId,
      table.receivedAt
    ),
  })
);

export type HostReport = InferSelectModel<typeof hostReport>;

export const hostInventoryItem = pgTable(
  "HostInventoryItem_v1",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    reportId: uuid("reportId")
      .notNull()
      .references(() => hostReport.id, { onDelete: "cascade" }),
    hostId: uuid("hostId")
      .notNull()
      .references(() => host.id, { onDelete: "cascade" }),
    tool: text("tool").notNull(),
    kind: varchar("kind", { enum: ["config", "skill"] }).notNull(),
    itemType: text("itemType"),
    scope: varchar("scope", { enum: ["user", "project"] }).notNull(),
    pattern: text("pattern"),
    path: text("path").notNull(),
    exists: boolean("exists").notNull(),
    contentHash: text("contentHash"),
    riskSurface: json("riskSurface").notNull(),
    resolvedAgainst: text("resolvedAgainst"),
  },
  (table) => ({
    reportIdx: index("HostInventoryItem_v1_report_idx").on(table.reportId),
    hostIdx: index("HostInventoryItem_v1_host_idx").on(table.hostId),
    toolIdx: index("HostInventoryItem_v1_tool_idx").on(table.tool),
    contentHashIdx: index("HostInventoryItem_v1_content_hash_idx").on(
      table.contentHash
    ),
  })
);

export type HostInventoryItem = InferSelectModel<typeof hostInventoryItem>;

export const hostFinding = pgTable(
  "HostFinding_v1",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    reportId: uuid("reportId")
      .notNull()
      .references(() => hostReport.id, { onDelete: "cascade" }),
    hostId: uuid("hostId")
      .notNull()
      .references(() => host.id, { onDelete: "cascade" }),
    findingId: text("findingId").notNull(),
    ruleId: text("ruleId").notNull(),
    // Stable across reports and machines, so a finding can be followed over
    // time and counted across the fleet. Falls back to the finding id.
    fingerprint: text("fingerprint").notNull(),
    severity: varchar("severity", {
      enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"],
    }).notNull(),
    category: text("category"),
    layer: text("layer"),
    filePath: text("filePath"),
    // Ties the finding to the exact bytes it was found in.
    contentHash: text("contentHash"),
    line: integer("line"),
    column: integer("column"),
    description: text("description").notNull(),
    evidence: text("evidence"),
    owasp: json("owasp").notNull(),
    cwe: text("cwe"),
    confidence: text("confidence"),
    fixable: boolean("fixable"),
    suppressed: boolean("suppressed").notNull().default(false),
  },
  (table) => ({
    reportIdx: index("HostFinding_v1_report_idx").on(table.reportId),
    hostIdx: index("HostFinding_v1_host_idx").on(table.hostId),
    fingerprintIdx: index("HostFinding_v1_fingerprint_idx").on(
      table.fingerprint
    ),
    severityIdx: index("HostFinding_v1_severity_idx").on(table.severity),
  })
);

export type HostFinding = InferSelectModel<typeof hostFinding>;

/**
 * An operator saying "seen, I am dealing with it".
 *
 * Kept apart from the findings themselves because those are immutable facts
 * about one report, while this is a mutable decision about a finding on a
 * machine that outlives any single report.
 */
export const findingAcknowledgement = pgTable(
  "FindingAcknowledgement_v1",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    hostId: uuid("hostId")
      .notNull()
      .references(() => host.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    acknowledgedBy: text("acknowledgedBy").notNull(),
    acknowledgedAt: timestamp("acknowledgedAt").notNull(),
    note: text("note"),
  },
  (table) => ({
    hostFingerprintKey: unique(
      "FindingAcknowledgement_v1_host_fingerprint_key"
    ).on(table.hostId, table.fingerprint),
  })
);

export type FindingAcknowledgement = InferSelectModel<
  typeof findingAcknowledgement
>;

/**
 * A decision to stop reporting a finding, with a reason and a scope.
 *
 * Scope matters more than anything else here: silencing a rule across the
 * whole fleet is a very different act from silencing one file on one machine,
 * and the console must be able to say which was done and why.
 */
export const findingSuppression = pgTable(
  "FindingSuppression_v1",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    scope: varchar("scope", { enum: ["fleet", "machine"] }).notNull(),
    /** Null for a fleet-wide suppression. */
    hostId: uuid("hostId").references(() => host.id, { onDelete: "cascade" }),
    /** One of these identifies what is silenced. */
    fingerprint: text("fingerprint"),
    ruleId: text("ruleId"),
    reason: text("reason").notNull(),
    createdBy: text("createdBy").notNull(),
    createdAt: timestamp("createdAt").notNull(),
    /** Null means indefinite — visible as such, never hidden. */
    expiresAt: timestamp("expiresAt"),
    revokedAt: timestamp("revokedAt"),
  },
  (table) => ({
    fingerprintIdx: index("FindingSuppression_v1_fingerprint_idx").on(
      table.fingerprint
    ),
    ruleIdx: index("FindingSuppression_v1_rule_idx").on(table.ruleId),
  })
);

export type FindingSuppression = InferSelectModel<typeof findingSuppression>;

/**
 * A single-use code that lets a machine enrol itself.
 *
 * `maxUses` is what makes an MDM rollout possible: one code, capped and
 * expiring, shipped to a cohort of machines rather than minted per laptop.
 */
export const enrolmentCode = pgTable(
  "EnrolmentCode_v1",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    code: text("code").notNull(),
    label: text("label"),
    maxUses: integer("maxUses").notNull().default(1),
    usedCount: integer("usedCount").notNull().default(0),
    createdBy: text("createdBy").notNull(),
    createdAt: timestamp("createdAt").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    revokedAt: timestamp("revokedAt"),
  },
  (table) => ({
    codeKey: unique("EnrolmentCode_v1_code_key").on(table.code),
  })
);

export type EnrolmentCode = InferSelectModel<typeof enrolmentCode>;

/**
 * What happened on this server, and who did it.
 *
 * Records actions taken here — never anything done to a machine, because
 * nothing here reaches one. Machine check-ins are recorded too, since from the
 * server's side receiving a report is an event worth auditing.
 */
export const activityEvent = pgTable(
  "ActivityEvent_v1",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    occurredAt: timestamp("occurredAt").notNull(),
    actorKind: varchar("actorKind", {
      enum: ["person", "service", "agent", "system"],
    }).notNull(),
    actorName: text("actorName").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    result: text("result").notNull(),
    /** The API call behind it, where there was one. */
    apiCall: text("apiCall"),
  },
  (table) => ({
    occurredIdx: index("ActivityEvent_v1_occurred_idx").on(table.occurredAt),
    actorIdx: index("ActivityEvent_v1_actor_idx").on(table.actorKind),
  })
);

export type ActivityEvent = InferSelectModel<typeof activityEvent>;

/**
 * A rule this server evaluates against what machines report.
 *
 * It never reaches a machine and cannot block anything there: a violation is
 * reported here, and the fix happens on the machine.
 */
export const policy = pgTable(
  "Policy_v1",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    /** Which rule id a reported finding must carry to violate this policy. */
    ruleId: text("ruleId").notNull(),
    severity: varchar("severity", {
      enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"],
    }).notNull(),
    version: integer("version").notNull().default(1),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: text("createdBy").notNull(),
    createdAt: timestamp("createdAt").notNull(),
    updatedAt: timestamp("updatedAt").notNull(),
  },
  (table) => ({
    nameKey: unique("Policy_v1_name_key").on(table.name),
  })
);

export type Policy = InferSelectModel<typeof policy>;
