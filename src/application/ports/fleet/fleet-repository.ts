import type {
  Host,
  InventoryItemKind,
  InventoryScope,
} from "@/src/domain/fleet/entities/host";

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
};

export type RecordInventoryItemInput = {
  tool: string;
  kind: InventoryItemKind;
  itemType: string | null;
  scope: InventoryScope;
  pattern: string | null;
  path: string;
  exists: boolean;
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
  riskSurface: string[];
};

export type FleetRepository = {
  /** Upserts the host by machineId and stores the report and its items. */
  recordReport(input: RecordHostReportInput): Promise<RecordedReport>;
  listHostSummaries(): Promise<HostSummary[]>;
  findHostDetail(hostId: string): Promise<HostDetail | null>;
};
