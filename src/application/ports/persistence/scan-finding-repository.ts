import type { ScanFinding } from "@/src/domain/scan/entities/scan-finding";
import type { Severity } from "@/src/domain/scan/value-objects/severity";

export type SaveScanFindingInput = {
  scanRunId: string;
  findingId: string;
  ruleId: string | null;
  severity: Severity;
  category: string | null;
  layer: string | null;
  filePath: string | null;
  description: string;
  evidence: string | null;
  owasp: unknown;
  cwe: string | null;
  confidence: string | null;
  fixable: boolean | null;
  rawFinding: unknown;
  createdAt: Date;
};

export type ScanFindingRepository = {
  deleteByScanRunIds(scanRunIds: string[]): Promise<void>;
  saveMany(findings: SaveScanFindingInput[]): Promise<void>;
  listByScanRunIds(scanRunIds: string[]): Promise<ScanFinding[]>;
};
