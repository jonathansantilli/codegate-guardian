import type {
  ScanMode,
  ScanRun,
  ScanToolName,
} from "@/src/domain/scan/entities/scan-run";

export type SaveScanRunInput = {
  chatId: string;
  messageId: string;
  toolCallId: string;
  toolName: ScanToolName;
  mode: string | null;
  scanMode: ScanMode | null;
  repositoryUrl: string | null;
  selectedSkill: string | null;
  guessedPath: string | null;
  findingsTotal: number;
  summaryBySeverity: unknown;
  rawOutput: unknown;
  rawReport: unknown;
  createdAt: Date;
};

export type SavedScanRunHandle = {
  id: string;
  messageId: string;
  toolCallId: string;
};

export type ScanRunRepository = {
  findIdsByMessageIds(messageIds: string[]): Promise<string[]>;
  deleteByMessageIds(messageIds: string[]): Promise<void>;
  saveMany(runs: SaveScanRunInput[]): Promise<SavedScanRunHandle[]>;
  listByMessageIds(messageIds: string[]): Promise<ScanRun[]>;
};
