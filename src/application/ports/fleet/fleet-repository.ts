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
  acknowledgeFinding(input: {
    hostId: string;
    fingerprint: string;
    acknowledgedBy: string;
    acknowledgedAt: Date;
    note?: string;
  }): Promise<void>;
};
