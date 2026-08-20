export const severityOrder = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
] as const;

export type ScanSeverity = (typeof severityOrder)[number];

export type SeverityCounts = Record<ScanSeverity, number>;

const severityWeight: Record<ScanSeverity, number> = {
  CRITICAL: 45,
  HIGH: 25,
  MEDIUM: 10,
  LOW: 3,
  INFO: 1,
};

export type ScanFindingView = {
  findingId: string;
  severity: ScanSeverity;
  category: string;
  description: string;
  evidence: string | null;
  filePath: string | null;
  owasp: string[];
  cwe: string | null;
  confidence: string | null;
  layer: string | null;
  ruleId: string | null;
};

export type ScanReportView =
  | {
      kind: "report";
      toolName: "scanGithubRepo" | "analyzeConfig";
      total: number;
      bySeverity: SeverityCounts;
      riskScore: number;
      findings: ScanFindingView[];
      message: string | null;
      repositoryUrl: string | null;
      selectedSkill: string | null;
      guessedPath: string | null;
    }
  | {
      kind: "needs-skill-selection";
      message: string;
      availableSkills: string[];
    }
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "empty";
      message: string;
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

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeSeverity(value: unknown): ScanSeverity {
  const normalized = asString(value)?.toUpperCase();

  if (normalized && severityOrder.includes(normalized as ScanSeverity)) {
    return normalized as ScanSeverity;
  }

  return "INFO";
}

function toSeverityCounts(
  summary: Record<string, unknown> | null,
  findings: ScanFindingView[]
): SeverityCounts {
  const initial: SeverityCounts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
  };

  const bySeverity = asRecord(summary?.by_severity);

  if (bySeverity) {
    for (const severity of severityOrder) {
      const count = bySeverity[severity];
      if (typeof count === "number" && Number.isFinite(count) && count >= 0) {
        initial[severity] = count;
      }
    }

    return initial;
  }

  for (const finding of findings) {
    initial[finding.severity] += 1;
  }

  return initial;
}

function normalizeFindings(report: Record<string, unknown>) {
  const findingsRaw = asArray(report.findings)
    .map((value) => asRecord(value))
    .filter((value): value is Record<string, unknown> => value !== null);

  const findings = findingsRaw.map((finding, index) => {
    const filePath = asString(finding.file_path);
    const rawSeverity = asString(finding.severity) ?? "INFO";

    return {
      findingId:
        asString(finding.finding_id) ??
        `${filePath ?? "unknown"}:${rawSeverity.toLowerCase()}:${index}`,
      severity: normalizeSeverity(finding.severity),
      category: asString(finding.category) ?? "UNSPECIFIED",
      description: asString(finding.description) ?? "No description provided",
      evidence: asString(finding.evidence),
      filePath,
      owasp: asArray(finding.owasp)
        .map((value) => asString(value))
        .filter((value): value is string => value !== null),
      cwe: asString(finding.cwe),
      confidence: asString(finding.confidence),
      layer: asString(finding.layer),
      ruleId: asString(finding.rule_id),
    } satisfies ScanFindingView;
  });

  findings.sort((left, right) => {
    const severityDelta =
      severityOrder.indexOf(left.severity) -
      severityOrder.indexOf(right.severity);

    if (severityDelta !== 0) {
      return severityDelta;
    }

    return left.findingId.localeCompare(right.findingId);
  });

  return findings;
}

export function calculateRiskScore(bySeverity: SeverityCounts): number {
  const weightedScore = severityOrder.reduce((total, severity) => {
    return total + bySeverity[severity] * severityWeight[severity];
  }, 0);

  if (weightedScore <= 0) {
    return 0;
  }

  return Math.min(100, Math.round(100 * (1 - Math.exp(-weightedScore / 80))));
}

export function extractScanReportView({
  toolName,
  output,
}: {
  toolName: "scanGithubRepo" | "analyzeConfig";
  output: unknown;
}): ScanReportView {
  const outputRecord = asRecord(output);

  if (!outputRecord) {
    return {
      kind: "empty",
      message: "No scan result available.",
    };
  }

  if (outputRecord.error === true) {
    return {
      kind: "error",
      message: asString(outputRecord.message) ?? "Scan failed.",
    };
  }

  if (outputRecord.needs_skill_selection === true) {
    return {
      kind: "needs-skill-selection",
      message:
        asString(outputRecord.message) ??
        "This repository has multiple skills. Choose one to continue.",
      availableSkills: asArray(outputRecord.available_skills)
        .map((value) => asString(value))
        .filter((value): value is string => value !== null),
    };
  }

  const report = asRecord(outputRecord.codegate_report);

  if (!report) {
    return {
      kind: "empty",
      message:
        asString(outputRecord.message) ??
        "Scan completed with no report payload.",
    };
  }

  const findings = normalizeFindings(report);
  const summary = asRecord(report.summary);
  const bySeverity = toSeverityCounts(summary, findings);
  const totalFromSummary = summary?.total;
  const total =
    typeof totalFromSummary === "number" && Number.isFinite(totalFromSummary)
      ? totalFromSummary
      : findings.length;

  return {
    kind: "report",
    toolName,
    total,
    bySeverity,
    riskScore: calculateRiskScore(bySeverity),
    findings,
    message: asString(outputRecord.message),
    repositoryUrl: asString(outputRecord.repository_url),
    selectedSkill: asString(outputRecord.selected_skill),
    guessedPath: asString(outputRecord.guessed_path),
  };
}
