import type {
  Host,
  InventoryItemKind,
  InventoryScope,
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
};

export type RecordedReport = {
  hostId: string;
  reportId: string;
};

/** A machine plus the headline numbers from its most recent check-in. */
export type HostSummary = {
  host: Host;
  lastReportId: string | null;
  lastCollectedAt: Date | null;
  itemsTotal: number;
  skillsTotal: number;
  configsTotal: number;
  toolNames: string[];
};

export type HostDetail = {
  host: Host;
  lastCollectedAt: Date | null;
  kbVersion: string | null;
  items: HostDetailItem[];
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

export type FleetRepository = {
  /** Upserts the host by machineId and stores the report and its items. */
  recordReport(input: RecordHostReportInput): Promise<RecordedReport>;
  listHostSummaries(): Promise<HostSummary[]>;
  findHostDetail(hostId: string): Promise<HostDetail | null>;
  /** Fleet-wide artifacts, grouped by content hash — never by name. */
  listArtifactGroups(): Promise<ArtifactGroup[]>;
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
  acknowledgeFinding(input: {
    hostId: string;
    fingerprint: string;
    acknowledgedBy: string;
    acknowledgedAt: Date;
    note?: string;
  }): Promise<void>;
};
