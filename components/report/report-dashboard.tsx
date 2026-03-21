"use client";

import {
  AlertTriangleIcon,
  FolderGit2Icon,
  GaugeIcon,
  GavelIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldIcon,
  UserCircle2Icon,
} from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { SeverityBar } from "@/components/scan/severity-bar";
import { Badge } from "@/components/ui/badge";
import { cn, fetcher } from "@/lib/utils";

type PolicyStatus = "pass" | "warn" | "fail";

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
    bySeverity: {
      CRITICAL: number;
      HIGH: number;
      MEDIUM: number;
      LOW: number;
      INFO: number;
    };
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
      severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
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

function formatTimestamp(value: string) {
  const date = new Date(value);
  return date.toLocaleString();
}

function statusLabel(status: PolicyStatus) {
  if (status === "pass") return "Pass";
  if (status === "warn") return "Warning";
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

function severityClasses(
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
) {
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

function EmptyState() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
      <div className="rounded-xl border border-border/60 bg-card p-6">
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

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
        <div className="rounded-xl border border-border/60 bg-card p-6 text-sm">
          Loading reporting overview...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-6 text-red-200 text-sm">
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
    data.posture.trend14d.reduce((acc, item) => Math.max(acc, item.findings), 0) ||
    1;
  const maxAgingCount =
    data.ownership.findingAgeBuckets.reduce(
      (acc, bucket) => Math.max(acc, bucket.count),
      0
    ) || 1;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/60 bg-card p-4">
        <div>
          <h1 className="font-semibold text-lg">AI Security Posture Report</h1>
          <p className="text-muted-foreground text-sm">
            Coverage, risk, governance, and ownership for AI tool security.
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Generated: {formatTimestamp(data.summary.generatedAt)}
          </p>
        </div>
        <Link
          className="inline-flex items-center rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
          href="/scan"
        >
          Start New Scan
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <div className="text-muted-foreground text-xs uppercase">Runs</div>
          <div className="mt-1 font-semibold text-xl">{data.summary.totalRuns}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <div className="text-muted-foreground text-xs uppercase">Findings</div>
          <div className="mt-1 font-semibold text-xl">{data.summary.totalFindings}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <div className="text-muted-foreground text-xs uppercase">Critical</div>
          <div className="mt-1 font-semibold text-xl">{data.summary.criticalFindings}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <div className="text-muted-foreground text-xs uppercase">Repos</div>
          <div className="mt-1 font-semibold text-xl">{data.summary.repositories}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <div className="text-muted-foreground text-xs uppercase">Assets</div>
          <div className="mt-1 font-semibold text-xl">{data.summary.scannedAssets}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <div className="text-muted-foreground text-xs uppercase">Skills</div>
          <div className="mt-1 font-semibold text-xl">{data.summary.uniqueSkills}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <div className="text-muted-foreground text-xs uppercase">Risk</div>
          <div className="mt-1 font-semibold text-xl">{data.summary.riskScore}/100</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <div className="text-muted-foreground text-xs uppercase">Governance</div>
          <div className="mt-1 font-semibold text-xl">
            {data.summary.governanceScore}/100
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <FolderGit2Icon className="size-4 text-muted-foreground" />
            <h2 className="font-medium text-sm">Asset Coverage</h2>
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            <Badge variant="outline">
              Repo scans: {data.coverage.bySource.repository}
            </Badge>
            <Badge variant="outline">Skill scans: {data.coverage.bySource.skills}</Badge>
            <Badge variant="outline">
              Config scans: {data.coverage.bySource.analyzeConfig}
            </Badge>
            <Badge variant="outline">
              Unique artifacts: {data.coverage.uniqueArtifacts}
            </Badge>
          </div>

          <div className="space-y-2">
            {data.coverage.artifactTypes.slice(0, 8).map((artifact) => (
              <div key={artifact.artifactType}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {artifact.artifactType}
                  </span>
                  <span>{artifact.count}</span>
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
          <div className="mb-3 flex items-center gap-2">
            <GaugeIcon className="size-4 text-muted-foreground" />
            <h2 className="font-medium text-sm">Risk Posture</h2>
          </div>

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
                      <span className="truncate">{item.category}</span>
                      <span>{item.count}</span>
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
                      <span className="truncate">{item.layer}</span>
                      <span>{item.count}</span>
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
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangleIcon className="size-4 text-muted-foreground" />
          <h2 className="font-medium text-sm">Findings Trend (14 days)</h2>
        </div>

        <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
          {data.posture.trend14d.map((point) => {
            const findingHeight = Math.max(
              6,
              Math.round((point.findings / maxTrendFindings) * 56)
            );
            const criticalHeight = Math.max(
              0,
              Math.round((point.critical / maxTrendFindings) * 56)
            );

            return (
              <div className="flex min-w-8 flex-col items-center gap-1" key={point.date}>
                <div
                  className="relative flex w-4 justify-center rounded-t bg-muted"
                  style={{ height: `${findingHeight}px` }}
                >
                  {point.critical > 0 && (
                    <div
                      className="absolute bottom-0 w-4 rounded-t bg-red-600"
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
            <Badge className={cn("rounded-full", statusClasses(data.governance.status))}>
              {statusLabel(data.governance.status)}
            </Badge>
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            <Badge variant="outline">
              Score: {data.governance.score}/100
            </Badge>
            <Badge variant="outline">
              Violations: {data.governance.violationCount}
            </Badge>
          </div>

          <div className="space-y-2">
            {data.governance.controls.map((control) => (
              <div
                className={cn(
                  "rounded-md border p-2",
                  control.status === "pass" && "border-emerald-400/30 bg-emerald-500/5",
                  control.status === "warn" && "border-amber-300/30 bg-amber-500/5",
                  control.status === "fail" && "border-red-400/30 bg-red-500/5"
                )}
                key={control.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">{control.name}</p>
                  <Badge variant="outline">{control.violations} violations</Badge>
                </div>
                <p className="mt-1 text-muted-foreground text-xs">
                  {control.description}
                </p>
                {control.evidence[0] && (
                  <p className="mt-1 line-clamp-2 text-xs">{control.evidence[0]}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <UserCircle2Icon className="size-4 text-muted-foreground" />
            <h2 className="font-medium text-sm">Ownership & Accountability</h2>
          </div>

          <div className="mb-3 space-y-2">
            {data.ownership.byOwner.slice(0, 6).map((owner) => (
              <div
                className="flex items-center justify-between gap-2 rounded-md border border-border/50 p-2"
                key={owner.owner}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{owner.owner}</p>
                  <p className="text-muted-foreground text-xs">
                    {owner.repositories} repos
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Badge variant="outline">{owner.findings} findings</Badge>
                  <Badge variant="outline">Risk {owner.riskScore}</Badge>
                </div>
              </div>
            ))}
          </div>

          <p className="mb-2 text-muted-foreground text-xs uppercase">Finding age</p>
          <div className="space-y-2">
            {data.ownership.findingAgeBuckets.map((bucket) => (
              <div key={bucket.bucket}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span>{bucket.bucket}</span>
                  <span>{bucket.count}</span>
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

      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldAlertIcon className="size-4 text-muted-foreground" />
          <h2 className="font-medium text-sm">Recent Critical Findings</h2>
        </div>

        {data.recentCriticalFindings.length === 0 ? (
          <p className="text-muted-foreground text-sm">No critical findings recorded.</p>
        ) : (
          <div className="space-y-2">
            {data.recentCriticalFindings.slice(0, 10).map((finding) => (
              <Link
                className="block rounded-md border border-red-500/30 bg-red-500/5 p-3 transition-colors hover:bg-red-500/10"
                href={`/chat/${finding.chatId}`}
                key={finding.id}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-red-500/40 bg-red-500/10 text-red-200">
                    CRITICAL
                  </Badge>
                  {finding.category && <Badge variant="outline">{finding.category}</Badge>}
                  {finding.selectedSkill && (
                    <Badge variant="outline">Skill: {finding.selectedSkill}</Badge>
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-sm">{finding.description}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                  <span>{finding.repositoryUrl ?? "Config scan"}</span>
                  {finding.filePath && <span>{finding.filePath}</span>}
                  <span>{formatTimestamp(finding.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheckIcon className="size-4 text-muted-foreground" />
            <h2 className="font-medium text-sm">Repository Accountability</h2>
          </div>
          <div className="space-y-2">
            {data.ownership.byRepository.slice(0, 8).map((repo) => (
              <div
                className="flex items-center justify-between gap-2 rounded-md border border-border/50 p-2"
                key={repo.repositoryUrl}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{repo.repositoryUrl}</p>
                  <p className="text-muted-foreground text-xs">
                    Owner: {repo.owner} • {formatTimestamp(repo.latestRunAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Badge variant="outline">{repo.findings} findings</Badge>
                  <Badge variant="outline">Risk {repo.riskScore}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldIcon className="size-4 text-muted-foreground" />
            <h2 className="font-medium text-sm">Recent Scan Runs</h2>
          </div>
          <div className="space-y-2">
            {data.recentRuns.slice(0, 10).map((run) => (
              <Link
                className="block rounded-md border border-border/50 p-2 transition-colors hover:bg-muted/40"
                href={`/chat/${run.chatId}`}
                key={run.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium text-sm">{run.chatTitle}</p>
                  <Badge variant="outline">{run.findingsTotal} findings</Badge>
                </div>
                <p className="truncate text-muted-foreground text-xs">
                  {run.repositoryUrl ?? "Config scan"}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2 text-muted-foreground text-xs">
                  <span>{formatTimestamp(run.createdAt)}</span>
                  {run.selectedSkill && <span>Skill: {run.selectedSkill}</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldAlertIcon className="size-4 text-muted-foreground" />
          <h2 className="font-medium text-sm">Top Risk Findings</h2>
        </div>
        <div className="space-y-2">
          {data.posture.topFindings.slice(0, 12).map((finding) => (
            <Link
              className="block rounded-md border border-border/50 p-2 transition-colors hover:bg-muted/40"
              href={`/chat/${finding.chatId}`}
              key={finding.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={cn("rounded-full", severityClasses(finding.severity))}>
                  {finding.severity}
                </Badge>
                {finding.category && <Badge variant="outline">{finding.category}</Badge>}
                {finding.selectedSkill && (
                  <Badge variant="outline">Skill: {finding.selectedSkill}</Badge>
                )}
              </div>
              <p className="mt-1 text-sm">{finding.description}</p>
              <div className="mt-1 flex flex-wrap gap-2 text-muted-foreground text-xs">
                <span>{finding.repositoryUrl ?? "Config scan"}</span>
                {finding.filePath && <span>{finding.filePath}</span>}
                <span>{formatTimestamp(finding.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
