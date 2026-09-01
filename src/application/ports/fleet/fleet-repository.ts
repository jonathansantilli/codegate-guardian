import type {
  Host,
  InventoryItemKind,
  InventoryScope,
  PublicHost,
} from "@/src/domain/fleet/entities/host";

/**
 * Where a finding sits in its life.
 *
 * Derived from report history, never stored: a finding is open while the
 * machine's latest report still contains it, and resolved once a later report
 * does not. The report is the evidence — nobody marks a finding done by hand.
 */
export const FINDING_STATUSES = [
  "open",
  "acknowledged",
  "resolved",
  "regressed",
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export type FleetFinding = {
  fingerprint: string;
  ruleId: string;
  severity: string;
  description: string;
  filePath: string | null;
  contentHash: string | null;
  status: FindingStatus;
  machineCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  /** The excerpt the scanner reported, so the console can show the bytes. */
  evidence: string | null;
  line: number | null;
  column: number | null;
};

export type RecordFindingInput = {
  findingId: string;
  ruleId: string;
  fingerprint: string;
  severity: string;
  category: string | null;
  layer: string | null;
  filePath: string | null;
  contentHash: string | null;
  line: number | null;
  column: number | null;
  description: string;
  evidence: string | null;
  owasp: unknown;
  cwe: string | null;
  confidence: string | null;
  fixable: boolean | null;
  suppressed: boolean;
};

export type RecordHostReportInput = {
  machineId: string;
  hostname: string;
  platform: string | null;
  osRelease: string | null;
  username: string | null;
  agentVersion: string | null;
  collectedAt: Date;
  receivedAt: Date;
  kbVersion: string | null;
  toolsDetected: unknown;
  items: RecordInventoryItemInput[];
  /**
   * Undefined means the agent reported inventory only. That is not the same
   * as an empty list, which asserts the machine is clean.
   */
  findings?: RecordFindingInput[];
};

export type RecordInventoryItemInput = {
  tool: string;
  kind: InventoryItemKind;
  itemType: string | null;
  scope: InventoryScope;
  pattern: string | null;
  path: string;
  exists: boolean;
  contentHash: string | null;
  riskSurface: unknown;
  resolvedAgainst: string | null;
  format: string | null;
};

export type RecordedReport = {
  hostId: string;
  reportId: string;
};

/** A machine plus the headline numbers from its most recent check-in. */
export type HostSummary = {
  host: PublicHost;
  lastReportId: string | null;
  lastCollectedAt: Date | null;
  itemsTotal: number;
  skillsTotal: number;
  configsTotal: number;
  toolNames: string[];
};

export type HostDetail = {
  host: PublicHost;
  lastCollectedAt: Date | null;
  kbVersion: string | null;
  /** What the machine actually carries. A probed path that is not there is not an artifact. */
  items: HostDetailItem[];
  /** How many paths the agent looked at, including the ones it did not find. */
  itemsChecked: number;
  /** Findings the machine's most recent findings-bearing report carried. */
  findings: HostFindingRow[];
  /** Newest first. What the machine has sent, and how it changed. */
  reports: HostReportSummary[];
};

/** One finding as it stands on a single machine. */
export type HostFindingRow = {
  fingerprint: string;
  ruleId: string;
  severity: string;
  description: string;
  filePath: string | null;
  contentHash: string | null;
  evidence: string | null;
  line: number | null;
  column: number | null;
};

export type HostReportSummary = {
  id: string;
  collectedAt: Date;
  receivedAt: Date;
  itemsTotal: number;
  findingsReported: boolean;
  findingsTotal: number;
  criticalTotal: number;
};

/**
 * Enrolment either binds a machine to a new token, or refuses because that
 * machine is already enrolled and healthy — taking it over would lock out the
 * machine that holds the current token.
 */
export type EnrolHostResult =
  | { outcome: "enrolled"; hostId: string }
  | { outcome: "already-enrolled" };

/**
 * One row of "act on these first": a machine, the person accountable for it,
 * and the reason — in that order, because an operator acts on a person's
 * laptop and not on an abstract rule.
 */
export type AttentionRow = {
  hostId: string;
  hostname: string;
  owner: string | null;
  team: string | null;
  fingerprint: string;
  ruleId: string;
  severity: string;
  description: string;
  filePath: string | null;
  lastSeenAt: Date;
  /** Who took responsibility ON THIS MACHINE, if anyone. */
  acknowledgedBy: string | null;
};

/** The numbers the overview leads with, counted server-side. */
export type FleetOverview = {
  hostsEnrolled: number;
  hostsReporting: number;
  ownersWithOpenFindings: number;
  teamsWithOpenFindings: number;
  openFindings: number;
  untriagedFindings: number;
  /** Reports received per hour over the last 24, oldest first. */
  checkInsPerHour: { hour: Date; count: number }[];
  /**
   * Machines with at least one open finding, and machines evaluated at all.
   *
   * Counted over the whole fleet rather than derived in the browser from the
   * attention list, which is capped — a fleet where every machine fails read
   * as mostly passing once it grew past the cap.
   */
  machinesWithFindings: number;
  /** How many attention rows exist in total, capped list or not. */
  attentionTotal: number;
  /** Machines whose enrolment was withdrawn, excluded from every count above. */
  hostsRevoked: number;
  /** When the newest accepted report arrived, or null if none ever has. */
  lastCheckInAt: Date | null;
  /** Reports rejected in the last hour, and why. Empty when ingest is healthy. */
  rejections: {
    hostname: string;
    owner: string | null;
    reason: string;
    at: Date;
  }[];
  /**
   * The newest content-feed version any machine reported running, and how old
   * it is. Detection still runs against an old feed — it just runs against
   * older indicators, which is worth saying out loud.
   */
  contentFeed: { version: string | null; ageDays: number | null };
};

export type HostDetailItem = {
  tool: string;
  kind: InventoryItemKind;
  itemType: string | null;
  scope: InventoryScope;
  path: string;
  exists: boolean;
  contentHash: string | null;
  riskSurface: string[];
};

/** One distinct set of bytes, and every machine carrying exactly those bytes. */
export type ArtifactVariant = {
  contentHash: string;
  machineCount: number;
  firstSeenAt: Date;
  paths: string[];
};

/** Artifacts sharing a name, split into their distinct variants. */
/**
 * One content hash, everywhere it appears.
 *
 * The siblings are the other variants sharing this artifact's name — what
 * makes a variant interesting is usually the one it is being confused with.
 */
export type ArtifactVariantDetail = {
  contentHash: string;
  name: string;
  tool: string;
  kind: InventoryItemKind;
  firstSeenAt: Date;
  machines: {
    hostId: string;
    hostname: string;
    owner: string | null;
    team: string | null;
    /** Every path this machine carries these exact bytes at. */
    paths: string[];
    lastSeenAt: Date;
  }[];
  siblings: ArtifactVariant[];
};

export type ArtifactGroup = {
  name: string;
  tool: string;
  kind: InventoryItemKind;
  variants: ArtifactVariant[];
  machineCount: number;
};

export type SuppressionScope = "fleet" | "machine";

export type SuppressFindingInput = {
  scope: SuppressionScope;
  /** Required for a machine-scoped suppression. */
  hostId?: string;
  /** One of these identifies what is silenced. */
  fingerprint?: string;
  ruleId?: string;
  reason: string;
  createdBy: string;
  createdAt: Date;
  expiresAt?: Date;
};

export type Suppression = {
  id: string;
  scope: SuppressionScope;
  hostId: string | null;
  fingerprint: string | null;
  ruleId: string | null;
  reason: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date | null;
  /** How many currently-reported findings this silences. */
  blastRadius: number;
};

export type MintEnrolmentCodeInput = {
  code: string;
  label?: string;
  maxUses: number;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
};

export type EnrolmentCodeSummary = {
  id: string;
  code: string;
  label: string | null;
  maxUses: number;
  usedCount: number;
  createdBy: string;
  expiresAt: Date;
  revokedAt: Date | null;
  usable: boolean;
};

export type ActorKind = "person" | "service" | "agent" | "system";

export type ActivityRecord = {
  id: string;
  occurredAt: Date;
  actorKind: ActorKind;
  actorName: string;
  action: string;
  target: string | null;
  result: string;
  apiCall: string | null;
};

export type RecordActivityInput = Omit<ActivityRecord, "id">;

/**
 * What this server is willing to be sent.
 *
 * Read by an agent before a check-in and re-applied here when one arrives:
 * the agent narrowing itself is a courtesy that saves bandwidth, not a
 * control. A client that ignores the policy is refused by the server that
 * published it.
 */
export type CollectionPolicyRecord = {
  collectContent: boolean;
  /** An artifact qualifies only if EVERY surface it declares is in here. */
  allowedRiskSurfaces: string[];
  maxBytesPerArtifact: number;
  maxArtifactsPerReport: number;
  updatedBy: string | null;
  updatedAt: Date | null;
};

export type SaveCollectionPolicyInput = {
  collectContent: boolean;
  allowedRiskSurfaces: string[];
  maxBytesPerArtifact: number;
  maxArtifactsPerReport: number;
  updatedBy: string;
  updatedAt: Date;
};

export type StoreArtifactContentInput = {
  contentHash: string;
  byteLength: number;
  content: string;
  riskSurface: string[];
  firstSeenAt: Date;
};

export type SavePolicyResult =
  | { outcome: "saved"; id: string }
  | { outcome: "name-taken" }
  | { outcome: "not-found" };

export type PolicyRecord = {
  id: string;
  name: string;
  description: string | null;
  ruleId: string;
  severity: string;
  version: number;
  enabled: boolean;
  createdBy: string;
  updatedAt: Date;
  /** Machines whose latest report violates this policy. */
  violatingMachines: number;
  /** Machines evaluated, so compliance can be stated honestly. */
  evaluatedMachines: number;
};

export type SavePolicyInput = {
  id?: string;
  name: string;
  description?: string;
  ruleId: string;
  severity: string;
  enabled: boolean;
  createdBy: string;
  now: Date;
};

export type FleetRepository = {
  /** Upserts the host by machineId and stores the report and its items. */
  recordReport(input: RecordHostReportInput): Promise<RecordedReport>;
  listHostSummaries(): Promise<HostSummary[]>;
  findHostDetail(hostId: string): Promise<HostDetail | null>;
  /**
   * Withdraws a machine's enrolment.
   *
   * The server stops accepting its reports. Nothing is sent to the machine —
   * it keeps running and keeps trying, and the console keeps the last thing
   * it reported so an operator can still see what was on it.
   */
  revokeHost(input: {
    hostId: string;
    revokedAt: Date;
    revokedBy: string;
  }): Promise<void>;
  /** Reverses a revocation, so the machine's reports are accepted again. */
  restoreHost(input: { hostId: string; at?: Date }): Promise<void>;
  /** The machine behind an agent's id, for deciding whether to accept a report. */
  findHostByMachineId(machineId: string): Promise<Host | null>;
  /**
   * The machine a reporting token belongs to.
   *
   * This is how a check-in is identified. The id in the request body is the
   * agent's claim; this is the server's record.
   */
  findHostByTokenHash(tokenHash: string): Promise<Host | null>;
  /**
   * Binds a machine to the token it will report with, creating its row if the
   * machine has never been seen. Re-enrolling replaces the token, so a
   * compromised one stops working the moment the machine enrols again.
   */
  enrolHost(input: {
    machineId: string;
    tokenHash: string;
    enrolledAt: Date;
  }): Promise<EnrolHostResult>;
  /** Machines and people needing attention, worst first. */
  listAttention(limit?: number): Promise<AttentionRow[]>;
  /** The overview's headline numbers in one round trip. */
  overview(now: Date): Promise<FleetOverview>;
  /** Fleet-wide artifacts, grouped by content hash — never by name. */
  listArtifactGroups(): Promise<ArtifactGroup[]>;
  /** One artifact variant: which machines carry this exact file. */
  findArtifactVariant(
    contentHash: string
  ): Promise<ArtifactVariantDetail | null>;
  /** Findings across the fleet, with status derived from report history. */
  listFindings(): Promise<FleetFinding[]>;
  /** Records that a person has taken responsibility for a finding. */
  /** Sets who is accountable for a machine. Display data, not authorization. */
  assignOwner(input: {
    hostId: string;
    owner: string | null;
    team: string | null;
  }): Promise<void>;
  /** Silences a finding, with the scope and reason recorded. */
  suppressFinding(input: SuppressFindingInput): Promise<{ id: string }>;
  listSuppressions(): Promise<Suppression[]>;
  revokeSuppression(input: { id: string; revokedAt: Date }): Promise<void>;
  mintEnrolmentCode(input: MintEnrolmentCodeInput): Promise<{ id: string }>;
  listEnrolmentCodes(now: Date): Promise<EnrolmentCodeSummary[]>;
  /** Spends one use of a code, or returns null when it cannot be used. */
  redeemEnrolmentCode(input: {
    code: string;
    now: Date;
  }): Promise<{ id: string } | null>;
  recordActivity(input: RecordActivityInput): Promise<void>;
  /**
   * Notes that a check-in was refused, at most once per reason per window.
   *
   * Refusals come from callers with no credential, so the row cannot carry
   * anything they said — an attacker who could write one row per request
   * could push every other entry out of the activity view, which is the only
   * record that a machine was taken over.
   */
  recordRejectionThrottled(input: {
    /**
     * Which refusal this is. A closed set, so the throttle key space stays
     * bounded no matter what a caller sends.
     */
    kind?: "check-in" | "enrolment";
    /** One of a fixed set of server-side constants, never caller text. */
    reason: string;
    at: Date;
    windowMs: number;
    /**
     * The machine the credential resolved to, when there is one. A revoked
     * machine is refused but identified, and it is refused on every check-in
     * for as long as it keeps running — so it needs the same one-row-per-
     * window treatment as an anonymous caller, just recorded under its own
     * name. Omitted for a caller we cannot identify.
     */
    actorName?: string;
  }): Promise<void>;
  listActivity(limit?: number): Promise<ActivityRecord[]>;
  /**
   * Deletes history older than the given cutoffs, and returns what went.
   *
   * Reports are the thing that grows: every machine writes one on every
   * check-in, for ever. Their inventory items and findings cascade with them.
   *
   * Two reports per machine are never deleted regardless of age — its latest,
   * which is where lastSeenAt and the current inventory come from, and its
   * latest findings-bearing one, which is what the whole finding lifecycle is
   * derived from. Removing that second one would not lose history; it would
   * make every finding on that machine disappear, and a console that shows a
   * compromised machine as clean is worse than one that shows nothing.
   */
  pruneHistory(input: {
    reportsBefore: Date;
    activityBefore: Date;
    signInAttemptsBefore: Date;
  }): Promise<{
    reports: number;
    activity: number;
    signInAttempts: number;
  }>;
  /**
   * Saves a policy, or reports that the name is taken.
   *
   * Names are unique because they are how an operator refers to a rule; a
   * collision is an ordinary thing for a person to do, not a server fault.
   */
  savePolicy(input: SavePolicyInput): Promise<SavePolicyResult>;
  listPolicies(): Promise<PolicyRecord[]>;
  acknowledgeFinding(input: {
    hostId: string;
    fingerprint: string;
    acknowledgedBy: string;
    acknowledgedAt: Date;
    note?: string;
  }): Promise<void>;
  /** Never null: an unconfigured instance reads as "collect nothing". */
  getCollectionPolicy(): Promise<CollectionPolicyRecord>;
  saveCollectionPolicy(
    input: SaveCollectionPolicyInput
  ): Promise<CollectionPolicyRecord>;
  /**
   * Stores artifact bytes, ignoring hashes already held.
   *
   * Content addressed by hash is immutable by definition, so a second machine
   * carrying the same artifact has nothing new to add. Returns how many rows
   * were genuinely new.
   */
  storeArtifactContents(inputs: StoreArtifactContentInput[]): Promise<number>;
  /** Which of these hashes this server already holds bytes for. */
  findStoredArtifactHashes(contentHashes: string[]): Promise<string[]>;
};
