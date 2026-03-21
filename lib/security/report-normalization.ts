const TOOL_TYPE_TO_NAME = {
  "tool-analyzeConfig": "analyzeConfig",
  "tool-scanGithubRepo": "scanGithubRepo",
} as const;

const SUPPORTED_SEVERITIES = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
] as const;

type SupportedSeverity = (typeof SUPPORTED_SEVERITIES)[number];

type ToolPart = {
  type?: unknown;
  state?: unknown;
  toolCallId?: unknown;
  output?: unknown;
};

type MessageLike = {
  chatId: string;
  id: string;
  createdAt: Date;
  parts: unknown;
};

export type NormalizedScanFinding = {
  findingId: string;
  ruleId: string | null;
  severity: SupportedSeverity;
  category: string | null;
  layer: string | null;
  filePath: string | null;
  description: string;
  evidence: string | null;
  owasp: string[];
  cwe: string | null;
  confidence: string | null;
  fixable: boolean | null;
  rawFinding: Record<string, unknown>;
};

export type NormalizedScanRun = {
  chatId: string;
  messageId: string;
  toolCallId: string;
  toolName: "analyzeConfig" | "scanGithubRepo";
  mode: string | null;
  scanMode: string | null;
  repositoryUrl: string | null;
  selectedSkill: string | null;
  guessedPath: string | null;
  findingsTotal: number;
  summaryBySeverity: Record<string, number>;
  rawOutput: Record<string, unknown>;
  rawReport: Record<string, unknown>;
  createdAt: Date;
  findings: NormalizedScanFinding[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toSeverity(value: unknown): SupportedSeverity {
  const normalized = asString(value)?.toUpperCase();
  if (!normalized) {
    return "INFO";
  }

  if (SUPPORTED_SEVERITIES.includes(normalized as SupportedSeverity)) {
    return normalized as SupportedSeverity;
  }

  return "INFO";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asString(item))
    .filter((item): item is string => item !== null);
}

function normalizeSummaryBySeverity(
  summary: Record<string, unknown> | null,
  findings: NormalizedScanFinding[]
): Record<string, number> {
  const bySeverity = asRecord(summary?.by_severity);

  if (bySeverity) {
    const parsed = Object.entries(bySeverity).reduce<Record<string, number>>(
      (accumulator, [severity, count]) => {
        const countNumber = asNumber(count);
        if (countNumber === null || countNumber < 0) {
          return accumulator;
        }

        accumulator[severity.toUpperCase()] = countNumber;
        return accumulator;
      },
      {}
    );

    if (Object.keys(parsed).length > 0) {
      return parsed;
    }
  }

  return findings.reduce<Record<string, number>>((accumulator, finding) => {
    accumulator[finding.severity] = (accumulator[finding.severity] ?? 0) + 1;
    return accumulator;
  }, {});
}

function normalizeFinding(
  finding: Record<string, unknown>,
  toolCallId: string,
  index: number
): NormalizedScanFinding {
  const rawSeverity = asString(finding.severity) ?? "unknown";
  const filePath = asString(finding.file_path);

  return {
    findingId:
      asString(finding.finding_id) ??
      `${toolCallId}:${filePath ?? "unknown"}:${rawSeverity.toLowerCase()}:${index}`,
    ruleId: asString(finding.rule_id),
    severity: toSeverity(finding.severity),
    category: asString(finding.category),
    layer: asString(finding.layer),
    filePath,
    description: asString(finding.description) ?? "No description provided",
    evidence: asString(finding.evidence),
    owasp: toStringArray(finding.owasp),
    cwe: asString(finding.cwe),
    confidence: asString(finding.confidence),
    fixable: asBoolean(finding.fixable),
    rawFinding: finding,
  };
}

function extractFindings(report: Record<string, unknown>, toolCallId: string) {
  const findingsRaw = Array.isArray(report.findings) ? report.findings : [];

  return findingsRaw
    .map((value) => asRecord(value))
    .filter((value): value is Record<string, unknown> => value !== null)
    .map((finding, index) => normalizeFinding(finding, toolCallId, index));
}

function isSupportedToolPart(part: ToolPart): part is ToolPart & {
  type: keyof typeof TOOL_TYPE_TO_NAME;
} {
  const type = asString(part.type);
  return Boolean(type && type in TOOL_TYPE_TO_NAME);
}

export function extractNormalizedScanRunsFromMessage(
  message: MessageLike
): NormalizedScanRun[] {
  if (!Array.isArray(message.parts)) {
    return [];
  }

  return message.parts
    .map((part) => asRecord(part))
    .filter((part): part is ToolPart => part !== null)
    .filter(isSupportedToolPart)
    .filter((part) => asString(part.state) === "output-available")
    .map((part, index) => {
      const output = asRecord(part.output);
      if (!output) {
        return null;
      }

      const report = asRecord(output.codegate_report);
      if (!report) {
        return null;
      }

      const toolCallId = asString(part.toolCallId) ?? `${message.id}:${index}`;
      const findings = extractFindings(report, toolCallId);
      const summary = asRecord(report.summary);
      const summaryTotal = asNumber(summary?.total);

      return {
        chatId: message.chatId,
        messageId: message.id,
        toolCallId,
        toolName: TOOL_TYPE_TO_NAME[part.type],
        mode: asString(output.mode),
        scanMode: asString(output.scan_mode),
        repositoryUrl: asString(output.repository_url),
        selectedSkill: asString(output.selected_skill),
        guessedPath: asString(output.guessed_path),
        findingsTotal: summaryTotal ?? findings.length,
        summaryBySeverity: normalizeSummaryBySeverity(summary, findings),
        rawOutput: output,
        rawReport: report,
        createdAt: message.createdAt,
        findings,
      } satisfies NormalizedScanRun;
    })
    .filter((run): run is NormalizedScanRun => run !== null);
}

export function extractNormalizedScanRunsFromMessages(messages: MessageLike[]) {
  return messages.flatMap((message) =>
    extractNormalizedScanRunsFromMessage(message)
  );
}
