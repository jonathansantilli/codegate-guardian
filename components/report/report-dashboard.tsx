"use client";

import {
  AlertTriangleIcon,
  FolderGit2Icon,
  GaugeIcon,
  GavelIcon,
  InfoIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldIcon,
  UserCircle2Icon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { FindingDetailsSheet } from "@/components/report/finding-details-sheet";
import { SeverityBar } from "@/components/scan/severity-bar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  complianceScoreClasses,
  riskExposureScoreClasses,
} from "@/lib/security/report-score-semantics";
import { cn, fetcher } from "@/lib/utils";

type PolicyStatus = "pass" | "warn" | "fail";
type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

type ReportingOverview = {
  summary: {
    generatedAt: string;
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
      artifactType: string;
      count: number;
    }>;
    repositories: Array<{
      repositoryUrl: string;
      owner: string;
      runs: number;
      findings: number;
      critical: number;
      high: number;
      latestRunAt: string;
    }>;
    skills: Array<{
      skill: string;
      runs: number;
      findings: number;
      repositories: number;
      latestRunAt: string;
    }>;
    uniqueSkills: number;
    uniqueArtifacts: number;
  };
  posture: {
    bySeverity: Record<Severity, number>;
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
      severity: Severity;
      category: string | null;
      filePath: string | null;
      description: string;
      createdAt: string;
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
      latestRunAt: string;
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
    createdAt: string;
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
    createdAt: string;
  }>;
};

const numberFormatter = new Intl.NumberFormat("en-US");

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return date.toLocaleString();
}

function humanizeToken(value: string) {
  const normalized = value.replace(/[_-]+/g, " ").trim();
  if (!normalized) {
    return value;
  }

  return normalized
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bMcp\b/g, "MCP")
    .replace(/\bIde\b/g, "IDE")
    .replace(/\bApi\b/g, "API")
    .replace(/\bUrl\b/g, "URL");
}

function formatCategory(category: string | null) {
  if (!category) {
    return "Unspecified";
  }
  return humanizeToken(category);
}

function formatLayer(layer: string) {
  if (/^L\d+$/i.test(layer)) {
    return layer.toUpperCase();
  }
  return humanizeToken(layer);
}

function formatArtifactType(artifactType: string) {
  if (artifactType === "mcp-config") {
    return "MCP Config";
  }
  if (artifactType === "ide-config") {
    return "IDE Config";
  }
  return humanizeToken(artifactType);
}

function compactRepository(repositoryUrl: string | null) {
  if (!repositoryUrl) {
    return "Config Scan";
  }

  try {
    const url = new URL(repositoryUrl);
    const path = url.pathname.replace(/^\/+/g, "");
    return path || repositoryUrl;
  } catch {
    return repositoryUrl;
  }
}

function normalizeEvidence(evidence: string) {
  return evidence
    .replace(/\bline\s+(\d+)\s+\1\s+\|/gi, "line $1 |")
    .replace(/\s+/g, " ")
    .trim();
}

function statusLabel(status: PolicyStatus) {
  if (status === "pass") {
    return "Pass";
  }
  if (status === "warn") {
    return "Warning";
  }
  return "Fail";
}

function statusClasses(status: PolicyStatus) {
  if (status === "pass") {
    return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  }
  if (status === "warn") {
    return "border-amber-300/40 bg-amber-500/10 text-amber-200";
  }
  return "border-red-400/40 bg-red-500/10 text-red-200";
}

function severityClasses(severity: Severity) {
  if (severity === "CRITICAL") {
    return "border-red-500/50 bg-red-500/10 text-red-200";
  }
  if (severity === "HIGH") {
    return "border-orange-500/50 bg-orange-500/10 text-orange-200";
  }
  if (severity === "MEDIUM") {
    return "border-amber-400/50 bg-amber-500/10 text-amber-200";
  }
  if (severity === "LOW") {
    return "border-sky-500/50 bg-sky-500/10 text-sky-200";
  }
  return "border-slate-500/50 bg-slate-500/10 text-slate-200";
}

function metricWidth(count: number, total: number) {
  if (count <= 0 || total <= 0) {
    return 0;
  }

  return Math.max(4, Math.round((count / total) * 100));
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label="More information"
          className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          type="button"
        >
          <InfoIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  helper,
}: {
  icon: typeof ShieldIcon;
  title: string;
  helper?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="font-medium text-sm">{title}</h2>
      </div>
      {helper && <InfoTip text={helper} />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
      <div className="rounded-2xl border border-border/60 bg-card p-6">
        <h2 className="font-medium text-base">No scan data yet</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Run your first repository or config scan to populate governance and
          risk reporting.
        </p>
        <div className="mt-4">
          <Link
            className="inline-flex items-center rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
            href="/scan"
          >
            Start New Scan
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ReportDashboard() {
  const { data, error, isLoading } = useSWR<ReportingOverview>(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/report`,
    fetcher
  );
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(
    null
  );

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
        <div className="rounded-2xl border border-border/60 bg-card p-6 text-sm">
          Loading reporting overview...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
        <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-6 text-red-200 text-sm">
          Failed to load reporting overview.
        </div>
      </div>
    );
  }

  if (data.summary.totalRuns === 0) {
    return <EmptyState />;
  }

  const maxArtifactCount =
    data.coverage.artifactTypes[0]?.count ?? data.coverage.uniqueArtifacts;
  const maxCategoryCount = data.posture.byCategory[0]?.count ?? 1;
  const maxLayerCount = data.posture.byLayer[0]?.count ?? 1;
  const maxTrendFindings =
    data.posture.trend14d.reduce(
      (acc, item) => Math.max(acc, item.findings),
      0
    ) || 1;
  const maxAgingCount =
    data.ownership.findingAgeBuckets.reduce(
      (acc, bucket) => Math.max(acc, bucket.count),
      0
    ) || 1;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 md:px-6">
      <div className="rounded-2xl border border-border/60 bg-card p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-semibold text-xl">
              AI Security Posture Report
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Coverage, risk, governance, and accountability for AI tool
              security.
            </p>
            <p className="mt-2 text-muted-foreground text-xs">
              Generated {formatTimestamp(data.summary.generatedAt)}
            </p>
          </div>
          <Link
            className="inline-flex items-center rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
            href="/scan"
          >
            Start New Scan
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div
          className={cn(
            "rounded-xl border p-4",
            riskExposureScoreClasses(data.summary.riskScore)
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Risk Score
            </p>
            <InfoTip text="Risk score is calculated from severity-weighted findings and scaled to 0-100. Critical findings carry the highest weight." />
          </div>
          <p className="mt-2 font-semibold text-3xl">
            {formatCount(data.summary.riskScore)}
            <span className="text-base text-muted-foreground">/100</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Critical: {formatCount(data.posture.bySeverity.CRITICAL)} • High:{" "}
            {formatCount(data.posture.bySeverity.HIGH)}
          </p>
        </div>

        <div
          className={cn(
            "rounded-xl border p-4",
            complianceScoreClasses(data.summary.governanceScore)
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Governance Score
            </p>
            <InfoTip text="Governance score starts at 100 and is reduced by weighted policy violations (for consent bypass, prompt injection, remote bootstrap execution, credential exposure, and MCP endpoint trust)." />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <p className="font-semibold text-3xl">
              {formatCount(data.summary.governanceScore)}
              <span className="text-base text-muted-foreground">/100</span>
            </p>
            <Badge
              className={cn(
                "rounded-full",
                statusClasses(data.governance.status)
              )}
            >
              {statusLabel(data.governance.status)}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatCount(data.governance.violationCount)} policy violations
          </p>
        </div>

        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4">
          <p className="text-xs uppercase tracking-wide text-red-200/80">
            Critical Findings
          </p>
          <p className="mt-2 font-semibold text-3xl text-red-200">
            {formatCount(data.summary.criticalFindings)}
          </p>
          <p className="mt-1 text-xs text-red-200/80">
            Across {formatCount(data.summary.repositories)} repositories and{" "}
            {formatCount(data.summary.scannedAssets)} scanned artifacts
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-lg border border-border/60 bg-card p-3">
          <p className="text-muted-foreground text-xs uppercase">Runs</p>
          <p className="mt-1 font-semibold text-xl">
            {formatCount(data.summary.totalRuns)}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-3">
          <p className="text-muted-foreground text-xs uppercase">Findings</p>
          <p className="mt-1 font-semibold text-xl">
            {formatCount(data.summary.totalFindings)}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-3">
          <p className="text-muted-foreground text-xs uppercase">Repos</p>
          <p className="mt-1 font-semibold text-xl">
            {formatCount(data.summary.repositories)}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-3">
          <p className="text-muted-foreground text-xs uppercase">Assets</p>
          <p className="mt-1 font-semibold text-xl">
            {formatCount(data.summary.scannedAssets)}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-3">
          <p className="text-muted-foreground text-xs uppercase">Skills</p>
          <p className="mt-1 font-semibold text-xl">
            {formatCount(data.summary.uniqueSkills)}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-3">
          <p className="text-muted-foreground text-xs uppercase">Owners</p>
          <p className="mt-1 font-semibold text-xl">
            {formatCount(data.ownership.byOwner.length)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <SectionHeading
            helper="Counts of what was scanned and where findings were detected."
            icon={FolderGit2Icon}
            title="Asset Coverage"
          />

          <div className="mb-3 flex flex-wrap gap-1.5">
            <Badge variant="outline">
              Repo scans: {formatCount(data.coverage.bySource.repository)}
            </Badge>
            <Badge variant="outline">
              Skill scans: {formatCount(data.coverage.bySource.skills)}
            </Badge>
            <Badge variant="outline">
              Config scans: {formatCount(data.coverage.bySource.analyzeConfig)}
            </Badge>
            <Badge variant="outline">
              Unique artifacts: {formatCount(data.coverage.uniqueArtifacts)}
            </Badge>
          </div>

          <div className="max-h-64 space-y-2 overflow-auto pr-1">
            {data.coverage.artifactTypes.slice(0, 10).map((artifact) => (
              <div key={artifact.artifactType}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {formatArtifactType(artifact.artifactType)}
                  </span>
                  <span>{formatCount(artifact.count)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-primary/70"
                    style={{
                      width: `${metricWidth(artifact.count, maxArtifactCount)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4">
          <SectionHeading
            helper="Distribution of security findings by severity, category, and analysis layer."
            icon={GaugeIcon}
            title="Risk Posture"
          />

          <SeverityBar
            bySeverity={data.posture.bySeverity}
            riskScore={data.summary.riskScore}
            total={data.summary.totalFindings}
          />

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <p className="mb-2 text-muted-foreground text-xs uppercase">
                Top categories
              </p>
              <div className="space-y-2">
                {data.posture.byCategory.slice(0, 4).map((item) => (
                  <div key={item.category}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="truncate">
                        {formatCategory(item.category)}
                      </span>
                      <span>{formatCount(item.count)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-orange-500/70"
                        style={{
                          width: `${metricWidth(item.count, maxCategoryCount)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-muted-foreground text-xs uppercase">
                Top layers
              </p>
              <div className="space-y-2">
                {data.posture.byLayer.slice(0, 4).map((item) => (
                  <div key={item.layer}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="truncate">
                        {formatLayer(item.layer)}
                      </span>
                      <span>{formatCount(item.count)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-sky-500/70"
                        style={{
                          width: `${metricWidth(item.count, maxLayerCount)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-4">
        <SectionHeading
          helper="Daily finding volume for the last 14 days. Red segment indicates critical findings."
          icon={AlertTriangleIcon}
          title="Findings Trend (14 days)"
        />

        <div className="mb-3 flex flex-wrap gap-1.5">
          <Badge variant="outline">Bars: total findings per day</Badge>
          <Badge variant="outline">Red segment: critical findings</Badge>
        </div>

        <div className="flex items-end gap-2 overflow-x-auto pb-1">
          {data.posture.trend14d.map((point) => {
            const findingHeight = Math.max(
              8,
              Math.round((point.findings / maxTrendFindings) * 64)
            );
            const criticalHeight = Math.max(
              0,
              Math.round((point.critical / maxTrendFindings) * 64)
            );

            return (
              <div
                className="flex min-w-9 flex-col items-center gap-1"
                key={point.date}
              >
                <div
                  className="relative flex w-5 justify-center rounded-t bg-muted"
                  style={{ height: `${findingHeight}px` }}
                >
                  {point.critical > 0 && (
                    <div
                      className="absolute bottom-0 w-5 rounded-t bg-red-600"
                      style={{ height: `${criticalHeight}px` }}
                    />
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {point.date.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <GavelIcon className="size-4 text-muted-foreground" />
              <h2 className="font-medium text-sm">Governance Compliance</h2>
            </div>
            <Badge
              className={cn(
                "rounded-full",
                statusClasses(data.governance.status)
              )}
            >
              {statusLabel(data.governance.status)}
            </Badge>
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            <Badge variant="outline">
              Score: {formatCount(data.governance.score)}/100
            </Badge>
            <Badge variant="outline">
              Violations: {formatCount(data.governance.violationCount)}
            </Badge>
          </div>

          <div className="max-h-[28rem] space-y-2 overflow-auto pr-1">
            {data.governance.controls.map((control) => (
              <div
                className={cn(
                  "rounded-md border p-3",
                  control.status === "pass" &&
                    "border-emerald-400/30 bg-emerald-500/5",
                  control.status === "warn" &&
                    "border-amber-300/30 bg-amber-500/5",
                  control.status === "fail" && "border-red-400/30 bg-red-500/5"
                )}
                key={control.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">{control.name}</p>
                  <Badge variant="outline">
                    {formatCount(control.violations)} violations
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground text-xs">
                  {control.description}
                </p>
                {control.evidence[0] && (
                  <p className="mt-2 rounded-md bg-black/20 px-2 py-1.5 font-mono text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
                    {normalizeEvidence(control.evidence[0])}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4">
          <SectionHeading
            helper="Risk ownership grouped by repository owner, plus finding age distribution."
            icon={UserCircle2Icon}
            title="Ownership & Accountability"
          />

          <div className="mb-3 space-y-2">
            {data.ownership.byOwner.slice(0, 6).map((owner) => (
              <div
                className="flex items-center justify-between gap-2 rounded-md border border-border/50 p-2"
                key={owner.owner}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{owner.owner}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatCount(owner.repositories)} repos
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Badge variant="outline">
                    {formatCount(owner.findings)} findings
                  </Badge>
                  <Badge variant="outline">
                    Risk {formatCount(owner.riskScore)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>

          <p className="mb-2 text-muted-foreground text-xs uppercase">
            Finding age
          </p>
          <div className="space-y-2">
            {data.ownership.findingAgeBuckets.map((bucket) => (
              <div key={bucket.bucket}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span>{bucket.bucket}</span>
                  <span>{formatCount(bucket.count)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-foreground/70"
                    style={{
                      width: `${metricWidth(bucket.count, maxAgingCount)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <SectionHeading
            helper="Most recent critical findings. Click any row to inspect full finding metadata in a side panel."
            icon={ShieldAlertIcon}
            title="Recent Critical Findings"
          />

          {data.recentCriticalFindings.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No critical findings recorded.
            </p>
          ) : (
            <div className="max-h-[36rem] space-y-2 overflow-auto pr-1">
              {data.recentCriticalFindings.slice(0, 12).map((finding) => (
                <button
                  className="block w-full rounded-md border border-red-500/30 bg-red-500/5 p-3 text-left transition-colors hover:bg-red-500/10"
                  key={finding.id}
                  onClick={() => setSelectedFindingId(finding.id)}
                  type="button"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-red-500/40 bg-red-500/10 text-red-200">
                      Critical
                    </Badge>
                    {finding.category && (
                      <Badge variant="outline">
                        {formatCategory(finding.category)}
                      </Badge>
                    )}
                    {finding.selectedSkill && (
                      <Badge
                        className="font-mono text-[11px]"
                        variant="outline"
                      >
                        Skill: {finding.selectedSkill}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-6 line-clamp-3">
                    {finding.description}
                  </p>
                  {finding.filePath && (
                    <p className="mt-2 rounded bg-black/20 px-2 py-1 font-mono text-[11px] text-muted-foreground leading-relaxed break-all line-clamp-2">
                      {finding.filePath}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                    <span>{compactRepository(finding.repositoryUrl)}</span>
                    <span>{formatTimestamp(finding.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4">
          <SectionHeading
            helper="Latest scan activity across repositories and skills."
            icon={ShieldIcon}
            title="Recent Scan Runs"
          />
          <div className="max-h-[36rem] space-y-2 overflow-auto pr-1">
            {data.recentRuns.slice(0, 14).map((run) => (
              <Link
                className="block rounded-md border border-border/50 p-3 transition-colors hover:bg-muted/40"
                href={`/chat/${run.chatId}`}
                key={run.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium text-sm">
                    {run.chatTitle}
                  </p>
                  <Badge variant="outline">
                    {formatCount(run.findingsTotal)} findings
                  </Badge>
                </div>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground break-all line-clamp-1">
                  {run.repositoryUrl ?? "Config scan"}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs">
                  <span>{formatTimestamp(run.createdAt)}</span>
                  {run.selectedSkill && (
                    <Badge className="font-mono text-[11px]" variant="outline">
                      Skill: {run.selectedSkill}
                    </Badge>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <details className="rounded-xl border border-border/60 bg-card p-4">
        <summary className="cursor-pointer list-none">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4 text-muted-foreground" />
            <h2 className="font-medium text-sm">
              Top Risk Findings (Detailed)
            </h2>
          </div>
        </summary>

        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-muted-foreground text-xs uppercase">
              Repository accountability
            </p>
            <div className="max-h-[24rem] space-y-2 overflow-auto pr-1">
              {data.ownership.byRepository.slice(0, 10).map((repo) => (
                <div
                  className="flex items-center justify-between gap-2 rounded-md border border-border/50 p-2"
                  key={repo.repositoryUrl}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">
                      {compactRepository(repo.repositoryUrl)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Owner: {repo.owner} • {formatTimestamp(repo.latestRunAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Badge variant="outline">
                      {formatCount(repo.findings)} findings
                    </Badge>
                    <Badge variant="outline">
                      Risk {formatCount(repo.riskScore)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-muted-foreground text-xs uppercase">
              Finding details
            </p>
            <div className="max-h-[24rem] space-y-2 overflow-auto pr-1">
              {data.posture.topFindings.slice(0, 12).map((finding) => (
                <button
                  className="block w-full rounded-md border border-border/50 p-2 text-left transition-colors hover:bg-muted/40"
                  key={finding.id}
                  onClick={() => setSelectedFindingId(finding.id)}
                  type="button"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className={cn(
                        "rounded-full",
                        severityClasses(finding.severity)
                      )}
                    >
                      {humanizeToken(finding.severity)}
                    </Badge>
                    {finding.category && (
                      <Badge variant="outline">
                        {formatCategory(finding.category)}
                      </Badge>
                    )}
                    {finding.selectedSkill && (
                      <Badge
                        className="font-mono text-[11px]"
                        variant="outline"
                      >
                        Skill: {finding.selectedSkill}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-6 line-clamp-3">
                    {finding.description}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2 text-muted-foreground text-xs">
                    <span>{compactRepository(finding.repositoryUrl)}</span>
                    {finding.filePath && (
                      <span className="font-mono text-[11px]">
                        {finding.filePath}
                      </span>
                    )}
                    <span>{formatTimestamp(finding.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>

      <FindingDetailsSheet
        findingId={selectedFindingId}
        onClose={() => setSelectedFindingId(null)}
      />
    </div>
  );
}
