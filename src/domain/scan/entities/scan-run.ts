export type ScanToolName = "analyzeConfig" | "scanGithubRepo";
export type ScanMode = "repository" | "skills";

export type ScanRun = {
  id: string;
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
