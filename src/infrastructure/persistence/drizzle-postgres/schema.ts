import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const user = pgTable(
  "User",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    email: varchar("email", { length: 64 }).notNull(),
    password: varchar("password", { length: 64 }),
    name: text("name"),
    image: text("image"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    // Sign-in reads the first row for an address, so a second account sharing
    // one could never authenticate — and registration checked for an existing
    // account in a separate statement from creating it, which two concurrent
    // requests both pass. The database settles it.
    emailKey: unique("User_email_key").on(table.email),
  })
);

export type User = InferSelectModel<typeof user>;

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
    /**
     * When this machine's enrolment was withdrawn.
     *
     * The server stops accepting its reports; it does not reach the machine,
     * which keeps running and keeps trying. What is left here is the last
     * thing it said before the door was closed.
     */
    revokedAt: timestamp("revokedAt"),
    revokedBy: text("revokedBy"),
    /**
     * sha256 of the token this machine reports with, issued at enrolment.
     *
     * The server identifies a machine by its token, not by the id in the
     * request body — otherwise any agent holding a shared secret could claim
     * another machine's identity and, by omitting its findings, mark it clean.
     * Only the hash is stored, so a database dump is not a set of working
     * fleet credentials.
     */
    agentTokenHash: text("agentTokenHash"),
    enrolledAt: timestamp("enrolledAt"),
    /**
     * Whether an operator has opened this machine to enrolment.
     *
     * Enrolment binds a credential to a machine, so "this row has no
     * credential" must not by itself mean "anyone with a code may take it".
     * A machine holding no token — restored, or predating per-machine tokens
     * — is a slot, and a slot left open is the takeover this whole change
     * exists to prevent. So the window is one an operator opens deliberately,
     * for one machine, and enrolling consumes it.
     */
    enrolmentOpen: boolean("enrolmentOpen").notNull().default(false),
    /**
     * When an operator opened the window, for windows an operator opened.
     *
     * Null means the window came from the upgrade backfill (migration 0014),
     * which has no expiry — a fleet upgrading from before per-machine tokens
     * re-enrols on its own schedule and must not be locked out by a clock.
     * A restore sets this, and that window expires: a credential-less slot
     * that stays open forever is one anybody holding a live enrolment code
     * can walk into, and a cohort code is held by every machine in the cohort.
     */
    enrolmentOpenedAt: timestamp("enrolmentOpenedAt"),
  },
  (table) => ({
    machineIdKey: unique("Host_v1_machine_id_key").on(table.machineId),
    lastSeenIdx: index("Host_v1_last_seen_idx").on(table.lastSeenAt),
    // Unique, so "one token identifies one machine" is enforced rather than
    // trusted to 256 bits of entropy. Nulls do not collide in Postgres, so
    // machines awaiting enrolment are unaffected.
    agentTokenKey: unique("Host_v1_agent_token_key").on(table.agentTokenHash),
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
    /**
     * Set only on rows that are rate-limited into one-per-window, and unique
     * so the DATABASE is what enforces that. A select-then-insert cannot: the
     * caller being throttled here is unauthenticated, so it can issue the
     * requests concurrently and every one of them reads "no recent row" before
     * any of them writes. Null for every other kind of event.
     */
    throttleKey: text("throttleKey"),
  },
  (table) => ({
    occurredIdx: index("ActivityEvent_v1_occurred_idx").on(table.occurredAt),
    actorIdx: index("ActivityEvent_v1_actor_idx").on(table.actorKind),
    throttleKeyIdx: uniqueIndex("ActivityEvent_v1_throttle_key_idx").on(
      table.throttleKey
    ),
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

/**
 * Failed sign-ins, bucketed into fixed windows.
 *
 * A console with one operator and no lockout lets anyone who reaches the port
 * try passwords for as long as they like, at whatever rate bcrypt allows, and
 * leaves nothing behind to say they did. Counting them in the database rather
 * than in memory keeps the limit real across restarts and across more than
 * one instance, and needs no service this project does not already run.
 */
export const signInAttempt = pgTable(
  "SignInAttempt_v1",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    /** Lowercased email. Never the password, and never a hash of one. */
    identifier: text("identifier").notNull(),
    /** Start of the fixed window this count belongs to. */
    windowStart: timestamp("windowStart").notNull(),
    failures: integer("failures").notNull().default(0),
  },
  (table) => ({
    windowUnique: unique("SignInAttempt_v1_identifier_window_unique").on(
      table.identifier,
      table.windowStart
    ),
    windowIdx: index("SignInAttempt_v1_window_idx").on(table.windowStart),
  })
);

export type SignInAttempt = InferSelectModel<typeof signInAttempt>;
