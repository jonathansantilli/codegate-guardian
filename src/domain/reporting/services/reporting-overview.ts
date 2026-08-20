import {
  calculateRiskScore,
  type SeverityCounts,
} from "@/src/domain/reporting/services/scan-report-view";

export type ReportSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type ReportingRunRecord = {
  id: string;
  chatId: string;
  chatTitle: string;
  createdAt: Date;
  toolName: "analyzeConfig" | "scanGithubRepo";
  scanMode: "repository" | "skills" | null;
  repositoryUrl: string | null;
  selectedSkill: string | null;
  guessedPath: string | null;
  findingsTotal: number;
};

export type ReportingFindingRecord = {
  id: string;
  scanRunId: string;
  chatId: string;
  createdAt: Date;
  severity: ReportSeverity;
  category: string | null;
  layer: string | null;
  filePath: string | null;
  description: string;
  evidence: string | null;
  repositoryUrl: string | null;
  selectedSkill: string | null;
};

type PolicyStatus = "pass" | "warn" | "fail";

export type ReportingOverview = {
  summary: {
    generatedAt: Date;
    totalRuns: number;
    totalFindings: number;
    repositories: number;
    scannedAssets: number;
    uniqueSkills: number;
    riskScore: number;
    governanceScore: number;
    criticalFindings: number;
  };
  coverage: {
    bySource: {
      repository: number;
      skills: number;
      analyzeConfig: number;
    };
    artifactTypes: Array<{
      artifactType: ArtifactType;
      count: number;
    }>;
    repositories: Array<{
      repositoryUrl: string;
      owner: string;
      runs: number;
      findings: number;
      critical: number;
      high: number;
      latestRunAt: Date;
    }>;
    skills: Array<{
      skill: string;
      runs: number;
      findings: number;
      repositories: number;
      latestRunAt: Date;
    }>;
    uniqueSkills: number;
    uniqueArtifacts: number;
  };
  posture: {
    bySeverity: SeverityCounts;
    byCategory: Array<{
      category: string;
      count: number;
    }>;
    byLayer: Array<{
      layer: string;
      count: number;
    }>;
    trend14d: Array<{
      date: string;
      runs: number;
      findings: number;
      critical: number;
      high: number;
    }>;
    topFindings: Array<{
      id: string;
      chatId: string;
      repositoryUrl: string | null;
      selectedSkill: string | null;
      severity: ReportSeverity;
      category: string | null;
      filePath: string | null;
      description: string;
      createdAt: Date;
    }>;
  };
  governance: {
    score: number;
    status: PolicyStatus;
    violationCount: number;
    controls: Array<{
      id: string;
      name: string;
      description: string;
      status: PolicyStatus;
      violations: number;
      evidence: string[];
    }>;
  };
  ownership: {
    byOwner: Array<{
      owner: string;
      repositories: number;
      findings: number;
      critical: number;
      high: number;
      riskScore: number;
    }>;
    byRepository: Array<{
      repositoryUrl: string;
      owner: string;
      findings: number;
      critical: number;
      high: number;
      latestRunAt: Date;
      riskScore: number;
    }>;
    findingAgeBuckets: Array<{
      bucket: "0-1d" | "2-7d" | "8-30d" | "30+d";
      count: number;
    }>;
  };
  recentRuns: Array<{
    id: string;
    chatId: string;
    chatTitle: string;
    createdAt: Date;
    repositoryUrl: string | null;
    selectedSkill: string | null;
    findingsTotal: number;
  }>;
  recentCriticalFindings: Array<{
    id: string;
    chatId: string;
    repositoryUrl: string | null;
    selectedSkill: string | null;
    filePath: string | null;
    category: string | null;
    description: string;
    createdAt: Date;
  }>;
};

export type ArtifactType =
  | "skill"
  | "hook"
  | "mcp-config"
  | "ide-config"
  | "rule"
  | "agent-doc"
  | "workflow"
  | "env"
  | "config"
  | "unknown";

const severityWeight: Record<ReportSeverity, number> = {
  CRITICAL: 20,
  HIGH: 12,
  MEDIUM: 7,
  LOW: 3,
  INFO: 1,
};

const severityRank: Record<ReportSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

const policyControls: Array<{
  id: string;
  name: string;
  description: string;
  predicate: (finding: ReportingFindingRecord) => boolean;
}> = [
  {
    id: "CG-POL-001",
    name: "No Consent Bypass",
    description:
      "Blocks flags and patterns that bypass user confirmations for risky actions.",
    predicate: (finding) => {
      const text = normalizedFindingText(finding);
      return (
        text.includes("consent_bypass") ||
        text.includes("dangerously") ||
        text.includes("skip-permissions") ||
        text.includes("--yolo") ||
        text.includes("--no-verify") ||
        text.includes("enableallprojectmcpservers") ||
        text.includes("enabledmcpjsonservers")
      );
    },
  },
  {
    id: "CG-POL-002",
    name: "No Remote Bootstrap Exec",
    description:
      "Disallow fetch-and-execute patterns such as curl|sh and equivalent shell bootstraps.",
    predicate: (finding) => {
      const text = normalizedFindingText(finding);
      return (
        text.includes("command_exec") ||
        /curl[^|]*\|\s*(sh|bash)/.test(text) ||
        /wget[^|]*\|\s*(sh|bash)/.test(text) ||
        /invoke-webrequest[^|]*\|\s*iex/.test(text)
      );
    },
  },
  {
    id: "CG-POL-003",
    name: "No Prompt/Rule Injection",
    description:
      "Detect hidden or deceptive instructions that manipulate agent behavior.",
    predicate: (finding) => {
      const text = normalizedFindingText(finding);
      return (
        text.includes("rule_injection") ||
        text.includes("prompt injection") ||
        text.includes("ignore previous instructions") ||
        text.includes("<!--") ||
        text.includes("hidden instruction")
      );
    },
  },
  {
    id: "CG-POL-004",
    name: "No Credential Exposure",
    description:
      "Detect leaked secrets or exfiltration-ready patterns in configs, commands, and URLs.",
    predicate: (finding) => {
      const text = normalizedFindingText(finding);
      return (
        text.includes("api_key") ||
        text.includes("token=") ||
        text.includes("password") ||
        text.includes("secret") ||
        text.includes("exfil") ||
        text.includes("anthropic_base_url")
      );
    },
  },
  {
    id: "CG-POL-005",
    name: "Trusted MCP Endpoints",
    description:
      "MCP endpoints must be trusted, explicit, and avoid insecure network exposure defaults.",
    predicate: (finding) => {
      const text = normalizedFindingText(finding);
      return (
        text.includes("mcp") &&
        (text.includes("http://") ||
          text.includes("0.0.0.0") ||
          text.includes("streamablehttp") ||
          text.includes("localhost"))
      );
    },
  },
];

function normalizedFindingText(finding: ReportingFindingRecord) {
  return `${finding.category ?? ""}\n${finding.description}\n${finding.evidence ?? ""}\n${finding.filePath ?? ""}`.toLowerCase();
}

function createZeroedSeverityCounts(): SeverityCounts {
  return {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
  };
}

function toDateKeyUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function evaluatePolicyStatus({
  violations,
  severities,
}: {
  violations: number;
  severities: SeverityCounts;
}): PolicyStatus {
  if (violations === 0) {
    return "pass";
  }

  if (severities.CRITICAL > 0 || severities.HIGH > 0) {
    return "fail";
  }

  return "warn";
}

export function extractRepositoryOwner(repositoryUrl: string | null) {
  if (!repositoryUrl) {
    return "local-config";
  }

  try {
    const parsed = new URL(repositoryUrl);
    const [owner] = parsed.pathname.split("/").filter(Boolean);

    if (owner) {
      return owner;
    }

    return parsed.hostname || "unknown-owner";
  } catch {
    return "unknown-owner";
  }
}

export function classifyArtifactType(path: string | null): ArtifactType {
  if (!path) {
    return "unknown";
  }

  const normalized = path.toLowerCase();

  if (normalized.includes("/skills/") || normalized.endsWith("skill.md")) {
    return "skill";
  }

  if (normalized.includes("hook")) {
    return "hook";
  }

  if (normalized.includes("mcp")) {
    return "mcp-config";
  }

  if (
    normalized.includes(".claude/") ||
    normalized.includes(".cursor/") ||
    normalized.includes(".windsurf/") ||
    normalized.includes(".vscode/") ||
    normalized.includes(".codex/")
  ) {
    return "ide-config";
  }

  if (
    normalized.endsWith("agents.md") ||
    normalized.endsWith("claude.md") ||
    normalized.endsWith("instructions.md")
  ) {
    return "agent-doc";
  }

  if (
    normalized.includes("/rules/") ||
    normalized.endsWith(".cursorrules") ||
    normalized.endsWith("rules.md")
  ) {
    return "rule";
  }

  if (normalized.includes(".github/workflows/")) {
    return "workflow";
  }

  if (normalized.startsWith(".env") || normalized.includes("/.env")) {
    return "env";
  }

  if (
    normalized.endsWith(".json") ||
    normalized.endsWith(".yaml") ||
    normalized.endsWith(".yml") ||
    normalized.endsWith(".toml") ||
    normalized.endsWith(".ini")
  ) {
    return "config";
  }

  return "unknown";
}

function toPolicyEvidence(finding: ReportingFindingRecord) {
  if (finding.evidence && finding.evidence.trim().length > 0) {
    return finding.evidence.trim();
  }

  return finding.description;
}

export function buildReportingOverview({
  runs,
  findings,
}: {
  runs: ReportingRunRecord[];
  findings: ReportingFindingRecord[];
}): ReportingOverview {
  const now = new Date();
  const bySeverity = createZeroedSeverityCounts();

  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
  }

  const riskScore = calculateRiskScore(bySeverity);

  const bySource = {
    repository: 0,
    skills: 0,
    analyzeConfig: 0,
  };

  const repositoryRuns = new Map<
    string,
    {
      repositoryUrl: string;
      owner: string;
      runs: number;
      findings: number;
      critical: number;
      high: number;
      latestRunAt: Date;
      bySeverity: SeverityCounts;
    }
  >();
  const skillRuns = new Map<
    string,
    {
      skill: string;
      runs: number;
      findings: number;
      repositories: Set<string>;
      latestRunAt: Date;
    }
  >();

  const artifactSet = new Set<string>();
  const artifactTypeMap = new Map<ArtifactType, number>();

  for (const run of runs) {
    if (run.toolName === "analyzeConfig") {
      bySource.analyzeConfig += 1;
    } else if (run.scanMode === "skills" || run.selectedSkill) {
      bySource.skills += 1;
    } else {
      bySource.repository += 1;
    }

    if (run.guessedPath) {
      artifactSet.add(run.guessedPath);
      const artifactType = classifyArtifactType(run.guessedPath);
      artifactTypeMap.set(
        artifactType,
        (artifactTypeMap.get(artifactType) ?? 0) + 1
      );
    }

    if (run.repositoryUrl) {
      const existing = repositoryRuns.get(run.repositoryUrl);

      if (existing) {
        existing.runs += 1;
        existing.findings += run.findingsTotal;
        if (run.createdAt > existing.latestRunAt) {
          existing.latestRunAt = run.createdAt;
        }
      } else {
        repositoryRuns.set(run.repositoryUrl, {
          repositoryUrl: run.repositoryUrl,
          owner: extractRepositoryOwner(run.repositoryUrl),
          runs: 1,
          findings: run.findingsTotal,
          critical: 0,
          high: 0,
          latestRunAt: run.createdAt,
          bySeverity: createZeroedSeverityCounts(),
        });
      }
    }

    if (run.selectedSkill) {
      const existing = skillRuns.get(run.selectedSkill);

      if (existing) {
        existing.runs += 1;
        existing.findings += run.findingsTotal;
        if (run.repositoryUrl) {
          existing.repositories.add(run.repositoryUrl);
        }
        if (run.createdAt > existing.latestRunAt) {
          existing.latestRunAt = run.createdAt;
        }
      } else {
        skillRuns.set(run.selectedSkill, {
          skill: run.selectedSkill,
          runs: 1,
          findings: run.findingsTotal,
          repositories: new Set(run.repositoryUrl ? [run.repositoryUrl] : []),
          latestRunAt: run.createdAt,
        });
      }
    }
  }

  const categoryMap = new Map<string, number>();
  const layerMap = new Map<string, number>();

  const trendMap = new Map<
    string,
    {
      date: string;
      runs: number;
      findings: number;
      critical: number;
      high: number;
    }
  >();

  for (let day = 13; day >= 0; day -= 1) {
    const current = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day)
    );
    const key = toDateKeyUtc(current);
    trendMap.set(key, {
      date: key,
      runs: 0,
      findings: 0,
      critical: 0,
      high: 0,
    });
  }

  for (const run of runs) {
    const key = toDateKeyUtc(run.createdAt);
    const bucket = trendMap.get(key);
    if (bucket) {
      bucket.runs += 1;
    }
  }

  for (const finding of findings) {
    const category = finding.category ?? "UNSPECIFIED";
    const layer = finding.layer ?? "UNSPECIFIED";
    categoryMap.set(category, (categoryMap.get(category) ?? 0) + 1);
    layerMap.set(layer, (layerMap.get(layer) ?? 0) + 1);

    if (finding.filePath) {
      artifactSet.add(finding.filePath);
      const artifactType = classifyArtifactType(finding.filePath);
      artifactTypeMap.set(
        artifactType,
        (artifactTypeMap.get(artifactType) ?? 0) + 1
      );
    }

    if (finding.repositoryUrl) {
      const repo = repositoryRuns.get(finding.repositoryUrl);
      if (repo) {
        repo.bySeverity[finding.severity] += 1;
        if (finding.severity === "CRITICAL") {
          repo.critical += 1;
        }
        if (finding.severity === "HIGH") {
          repo.high += 1;
        }
      }
    }

    const key = toDateKeyUtc(finding.createdAt);
    const bucket = trendMap.get(key);
    if (bucket) {
      bucket.findings += 1;
      if (finding.severity === "CRITICAL") {
        bucket.critical += 1;
      }
      if (finding.severity === "HIGH") {
        bucket.high += 1;
      }
    }
  }

  const controls = policyControls.map((control) => {
    const controlFindings = findings.filter(control.predicate);
    const severities = createZeroedSeverityCounts();

    for (const finding of controlFindings) {
      severities[finding.severity] += 1;
    }

    const status = evaluatePolicyStatus({
      violations: controlFindings.length,
      severities,
    });

    return {
      id: control.id,
      name: control.name,
      description: control.description,
      status,
      violations: controlFindings.length,
      evidence: [...new Set(controlFindings.map(toPolicyEvidence))].slice(0, 3),
      findings: controlFindings,
    };
  });

  const violatingFindings = new Map<string, ReportingFindingRecord>();
  for (const control of controls) {
    for (const finding of control.findings) {
      violatingFindings.set(finding.id, finding);
    }
  }

  let governancePenalty = 0;
  for (const finding of violatingFindings.values()) {
    governancePenalty += severityWeight[finding.severity];
  }

  const governanceScore = Math.max(0, Math.min(100, 100 - governancePenalty));
  const governanceStatus: PolicyStatus =
    governanceScore >= 90 ? "pass" : governanceScore >= 70 ? "warn" : "fail";

  const repositories = [...repositoryRuns.values()]
    .sort((left, right) => {
      if (right.critical !== left.critical) {
        return right.critical - left.critical;
      }

      if (right.high !== left.high) {
        return right.high - left.high;
      }

      return right.latestRunAt.getTime() - left.latestRunAt.getTime();
    })
    .map((repo) => ({
      repositoryUrl: repo.repositoryUrl,
      owner: repo.owner,
      runs: repo.runs,
      findings: repo.findings,
      critical: repo.critical,
      high: repo.high,
      latestRunAt: repo.latestRunAt,
    }));

  const skills = [...skillRuns.values()]
    .sort((left, right) => {
      if (right.findings !== left.findings) {
        return right.findings - left.findings;
      }

      return right.latestRunAt.getTime() - left.latestRunAt.getTime();
    })
    .map((skill) => ({
      skill: skill.skill,
      runs: skill.runs,
      findings: skill.findings,
      repositories: skill.repositories.size,
      latestRunAt: skill.latestRunAt,
    }));

  const byOwnerMap = new Map<
    string,
    {
      owner: string;
      repositories: Set<string>;
      findings: number;
      critical: number;
      high: number;
      bySeverity: SeverityCounts;
    }
  >();

  for (const repo of repositories) {
    const existing = byOwnerMap.get(repo.owner);
    const sourceBySeverity =
      repositoryRuns.get(repo.repositoryUrl)?.bySeverity ??
      createZeroedSeverityCounts();

    if (existing) {
      existing.repositories.add(repo.repositoryUrl);
      existing.findings += repo.findings;
      existing.critical += repo.critical;
      existing.high += repo.high;
      for (const severity of Object.keys(
        sourceBySeverity
      ) as ReportSeverity[]) {
        existing.bySeverity[severity] += sourceBySeverity[severity];
      }
    } else {
      byOwnerMap.set(repo.owner, {
        owner: repo.owner,
        repositories: new Set([repo.repositoryUrl]),
        findings: repo.findings,
        critical: repo.critical,
        high: repo.high,
        bySeverity: { ...sourceBySeverity },
      });
    }
  }

  const byOwner = [...byOwnerMap.values()]
    .map((owner) => ({
      owner: owner.owner,
      repositories: owner.repositories.size,
      findings: owner.findings,
      critical: owner.critical,
      high: owner.high,
      riskScore: calculateRiskScore(owner.bySeverity),
    }))
    .sort((left, right) => {
      if (right.riskScore !== left.riskScore) {
        return right.riskScore - left.riskScore;
      }

      return right.findings - left.findings;
    });

  const byRepository = repositories.map((repo) => {
    const repoBySeverity =
      repositoryRuns.get(repo.repositoryUrl)?.bySeverity ??
      createZeroedSeverityCounts();

    return {
      repositoryUrl: repo.repositoryUrl,
      owner: repo.owner,
      findings: repo.findings,
      critical: repo.critical,
      high: repo.high,
      latestRunAt: repo.latestRunAt,
      riskScore: calculateRiskScore(repoBySeverity),
    };
  });

  const ageBuckets = {
    "0-1d": 0,
    "2-7d": 0,
    "8-30d": 0,
    "30+d": 0,
  };

  for (const finding of findings) {
    const ageDays = Math.floor(
      (now.getTime() - finding.createdAt.getTime()) / (24 * 60 * 60 * 1000)
    );

    if (ageDays <= 1) {
      ageBuckets["0-1d"] += 1;
    } else if (ageDays <= 7) {
      ageBuckets["2-7d"] += 1;
    } else if (ageDays <= 30) {
      ageBuckets["8-30d"] += 1;
    } else {
      ageBuckets["30+d"] += 1;
    }
  }

  const topFindings = [...findings]
    .sort((left, right) => {
      const severityDelta =
        severityRank[left.severity] - severityRank[right.severity];
      if (severityDelta !== 0) {
        return severityDelta;
      }

      return right.createdAt.getTime() - left.createdAt.getTime();
    })
    .slice(0, 15)
    .map((finding) => ({
      id: finding.id,
      chatId: finding.chatId,
      repositoryUrl: finding.repositoryUrl,
      selectedSkill: finding.selectedSkill,
      severity: finding.severity,
      category: finding.category,
      filePath: finding.filePath,
      description: finding.description,
      createdAt: finding.createdAt,
    }));

  const recentRuns = [...runs]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 20)
    .map((run) => ({
      id: run.id,
      chatId: run.chatId,
      chatTitle: run.chatTitle,
      createdAt: run.createdAt,
      repositoryUrl: run.repositoryUrl,
      selectedSkill: run.selectedSkill,
      findingsTotal: run.findingsTotal,
    }));

  const recentCriticalFindings = findings
    .filter((finding) => finding.severity === "CRITICAL")
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 20)
    .map((finding) => ({
      id: finding.id,
      chatId: finding.chatId,
      repositoryUrl: finding.repositoryUrl,
      selectedSkill: finding.selectedSkill,
      filePath: finding.filePath,
      category: finding.category,
      description: finding.description,
      createdAt: finding.createdAt,
    }));

  const artifactTypes = [...artifactTypeMap.entries()]
    .map(([artifactType, count]) => ({ artifactType, count }))
    .sort((left, right) => right.count - left.count);

  const trend14d = [...trendMap.values()];

  return {
    summary: {
      generatedAt: now,
      totalRuns: runs.length,
      totalFindings: findings.length,
      repositories: repositories.length,
      scannedAssets: artifactSet.size,
      uniqueSkills: skills.length,
      riskScore,
      governanceScore,
      criticalFindings: bySeverity.CRITICAL,
    },
    coverage: {
      bySource,
      artifactTypes,
      repositories,
      skills,
      uniqueSkills: skills.length,
      uniqueArtifacts: artifactSet.size,
    },
    posture: {
      bySeverity,
      byCategory: [...categoryMap.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((left, right) => right.count - left.count),
      byLayer: [...layerMap.entries()]
        .map(([layer, count]) => ({ layer, count }))
        .sort((left, right) => right.count - left.count),
      trend14d,
      topFindings,
    },
    governance: {
      score: governanceScore,
      status: governanceStatus,
      violationCount: violatingFindings.size,
      controls: controls.map((control) => ({
        id: control.id,
        name: control.name,
        description: control.description,
        status: control.status,
        violations: control.violations,
        evidence: control.evidence,
      })),
    },
    ownership: {
      byOwner,
      byRepository,
      findingAgeBuckets: [
        { bucket: "0-1d", count: ageBuckets["0-1d"] },
        { bucket: "2-7d", count: ageBuckets["2-7d"] },
        { bucket: "8-30d", count: ageBuckets["8-30d"] },
        { bucket: "30+d", count: ageBuckets["30+d"] },
      ],
    },
    recentRuns,
    recentCriticalFindings,
  };
}
