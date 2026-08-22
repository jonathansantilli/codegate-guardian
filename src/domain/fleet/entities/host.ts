/**
 * A machine running the codegate agent.
 *
 * Identity is `machineId`: an opaque value the agent generates once and
 * persists locally. Hostnames are neither unique across an organization nor
 * stable for a given laptop, so they are display data only.
 */
export type Host = {
  id: string;
  machineId: string;
  hostname: string;
  /** The person accountable for this machine. Display data, set by an operator. */
  owner: string | null;
  team: string | null;
  platform: string | null;
  osRelease: string | null;
  username: string | null;
  agentVersion: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

/**
 * One check-in from an agent. Every report is retained, so the fleet view can
 * show what a machine looks like now and how it got there.
 */
export type HostReport = {
  id: string;
  hostId: string;
  /** When the server accepted the report. */
  receivedAt: Date;
  /** When the agent collected it, per the machine's own clock. */
  collectedAt: Date;
  kbVersion: string | null;
  itemsTotal: number;
  toolsDetected: unknown;
  createdAt: Date;
};

/** One resolved artifact found on a machine: an agent config or a skill. */
export type HostInventoryItem = {
  id: string;
  reportId: string;
  hostId: string;
  tool: string;
  kind: InventoryItemKind;
  itemType: string | null;
  scope: InventoryScope;
  pattern: string | null;
  path: string;
  exists: boolean;
  /** Content hash — the artifact's identity. Null when absent or unhashed. */
  contentHash: string | null;
  riskSurface: unknown;
  resolvedAgainst: string | null;
};

export const INVENTORY_ITEM_KINDS = ["config", "skill"] as const;
export type InventoryItemKind = (typeof INVENTORY_ITEM_KINDS)[number];

export const INVENTORY_SCOPES = ["user", "project"] as const;
export type InventoryScope = (typeof INVENTORY_SCOPES)[number];
