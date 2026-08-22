"use client";

import {
  FileCodeIcon,
  LaptopIcon,
  PackageIcon,
  ServerIcon,
  ShieldAlertIcon,
  SparklesIcon,
} from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  fleetShare,
  hasMultipleVariants,
  orderVariants,
  shortHash,
} from "@/lib/security/artifact-presentation";
import {
  isOutstanding,
  STATUS_LABEL,
  severityRank,
  statusExplanation,
} from "@/lib/security/finding-presentation";
import {
  formatRelativeTime,
  getHostFreshness,
  type HostFreshness,
} from "@/lib/security/fleet-presentation";
import { cn, fetcher } from "@/lib/utils";
import type { FindingStatus } from "@/src/application/ports/fleet/fleet-repository";
import { AccessPanel, ActivityPanel, PoliciesPanel } from "./console-panels";
import { EvidenceView } from "./evidence-view";
import { LifecycleTrack } from "./lifecycle-track";

type HostSummary = {
  host: {
    id: string;
    machineId: string;
    hostname: string;
    platform: string | null;
    osRelease: string | null;
    username: string | null;
    owner: string | null;
    team: string | null;
    agentVersion: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
  };
  lastCollectedAt: string | null;
  itemsTotal: number;
  skillsTotal: number;
  configsTotal: number;
  toolNames: string[];
};

type FleetFinding = {
  fingerprint: string;
  ruleId: string;
  severity: string;
  description: string;
  filePath: string | null;
  contentHash: string | null;
  status: FindingStatus;
  machineCount: number;
  lastSeenAt: string;
  acknowledgedBy: string | null;
  evidence?: string | null;
  line?: number | null;
  column?: number | null;
};

const severityColor: Record<string, string> = {
  CRITICAL: "text-red-700 dark:text-red-400",
  HIGH: "text-orange-700 dark:text-orange-400",
  MEDIUM: "text-amber-700 dark:text-amber-400",
  LOW: "text-sky-700 dark:text-sky-400",
  INFO: "text-muted-foreground",
};

type ArtifactVariant = {
  contentHash: string;
  machineCount: number;
  firstSeenAt: string;
  paths: string[];
};

type ArtifactGroup = {
  name: string;
  tool: string;
  kind: string;
  variants: ArtifactVariant[];
  machineCount: number;
};

type FleetView =
  | "machines"
  | "artifacts"
  | "people"
  | "policies"
  | "activity"
  | "access";

type HostDetail = {
  host: HostSummary["host"];
  lastCollectedAt: string | null;
  kbVersion: string | null;
  items: Array<{
    tool: string;
    kind: "config" | "skill";
    itemType: string | null;
    scope: "user" | "project";
    path: string;
    exists: boolean;
    riskSurface: string[];
  }>;
};

const freshnessLabel: Record<HostFreshness, string> = {
  online: "Reporting",
  stale: "Stale",
  offline: "Offline",
};

const freshnessClasses: Record<HostFreshness, string> = {
  online: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  stale: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  offline: "bg-muted text-muted-foreground",
};

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof LaptopIcon;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3">
      <div className="flex size-9 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div>
        <p className="font-semibold text-2xl tabular-nums leading-none">
          {value}
        </p>
        <p className="mt-1 text-muted-foreground text-xs">{label}</p>
      </div>
    </div>
  );
}

export function FleetDashboard() {
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [view, setView] = useState<FleetView>("machines");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openFinding, setOpenFinding] = useState<string | null>(null);

  const { data, isLoading } = useSWR<{ hosts: HostSummary[] }>(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/fleet`,
    fetcher,
    { refreshInterval: 30_000 }
  );

  const { data: findingData } = useSWR<{ findings: FleetFinding[] }>(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/fleet/findings`,
    fetcher,
    { refreshInterval: 30_000 }
  );

  const { data: artifactData } = useSWR<{ artifacts: ArtifactGroup[] }>(
    view === "artifacts"
      ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/fleet/artifacts`
      : null,
    fetcher
  );

  const { data: detail } = useSWR<HostDetail>(
    selectedHostId
      ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/fleet/host?hostId=${selectedHostId}`
      : null,
    fetcher
  );

  const hosts = data?.hosts ?? [];
  const findings = [...(findingData?.findings ?? [])].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity)
  );
  const outstanding = findings.filter((f) => isOutstanding(f.status));
  const artifacts = artifactData?.artifacts ?? [];

  // Machines grouped by the person accountable for them.
  const byOwner = new Map<string, HostSummary[]>();
  for (const entry of hosts) {
    const key = entry.host.owner ?? "Unassigned";
    byOwner.set(key, [...(byOwner.get(key) ?? []), entry]);
  }
  const owners = [...byOwner.entries()].sort(
    (a, b) => b[1].length - a[1].length
  );
  const totals = hosts.reduce(
    (acc, entry) => ({
      skills: acc.skills + entry.skillsTotal,
      configs: acc.configs + entry.configsTotal,
      stale:
        acc.stale +
        (getHostFreshness(new Date(entry.host.lastSeenAt)) === "online"
          ? 0
          : 1),
    }),
    { skills: 0, configs: 0, stale: 0 }
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <header className="mb-6">
        <h1 className="font-semibold text-2xl tracking-tight">Fleet</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Every machine running the codegate agent, and the AI tooling installed
          on it.
        </p>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={LaptopIcon} label="Machines" value={hosts.length} />
        <StatTile icon={SparklesIcon} label="Skills" value={totals.skills} />
        <StatTile
          icon={FileCodeIcon}
          label="Tool configs"
          value={totals.configs}
        />
        <StatTile
          icon={ShieldAlertIcon}
          label="Open findings"
          value={outstanding.length}
        />
      </div>

      {outstanding.length > 0 && (
        <div className="mb-8 overflow-hidden rounded-xl border border-border/50">
          <div className="flex items-center gap-2.5 border-border/50 border-b bg-muted/30 px-4 py-2.5">
            <h2 className="font-medium text-sm">Act on these first</h2>
            <span className="text-muted-foreground text-xs">
              A finding closes when a later report no longer contains it
            </span>
          </div>
          <ul className="divide-y divide-border/40">
            {outstanding.map((finding) => (
              <li key={finding.fingerprint}>
                <button
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40"
                  onClick={() =>
                    setOpenFinding(
                      openFinding === finding.fingerprint
                        ? null
                        : finding.fingerprint
                    )
                  }
                  type="button"
                >
                  <span
                    className={cn(
                      "mt-0.5 font-medium text-xs tabular-nums",
                      severityColor[finding.severity] ?? "text-muted-foreground"
                    )}
                  >
                    {finding.severity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{finding.description}</p>
                    <p className="truncate font-mono text-muted-foreground text-xs">
                      {finding.ruleId}
                      {finding.filePath ? ` · ${finding.filePath}` : ""}
                    </p>
                    <p className="mt-1 text-muted-foreground text-xs">
                      {statusExplanation(
                        finding.status,
                        new Date(finding.lastSeenAt)
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge className="font-normal text-xs" variant="secondary">
                      {STATUS_LABEL[finding.status]}
                    </Badge>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {finding.machineCount} machine
                      {finding.machineCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </button>
                {openFinding === finding.fingerprint && (
                  <div className="flex flex-col gap-4 border-border/40 border-t bg-muted/20 px-4 py-4">
                    <LifecycleTrack status={finding.status} />
                    <p className="text-muted-foreground text-xs">
                      {statusExplanation(
                        finding.status,
                        new Date(finding.lastSeenAt)
                      )}
                    </p>
                    <EvidenceView
                      column={finding.column ?? null}
                      contentHash={finding.contentHash}
                      evidence={finding.evidence ?? null}
                      filePath={finding.filePath}
                      line={finding.line ?? null}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 flex items-center gap-1">
        {(
          [
            "machines",
            "artifacts",
            "people",
            "policies",
            "activity",
            "access",
          ] as const
        ).map((tab) => (
          <button
            className={cn(
              "h-8 rounded-lg px-3 font-medium text-sm capitalize transition-colors",
              view === tab
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={tab}
            onClick={() => setView(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      {view === "policies" && <PoliciesPanel />}
      {view === "activity" && <ActivityPanel />}
      {view === "access" && <AccessPanel />}

      {view === "artifacts" && (
        <div className="overflow-hidden rounded-xl border border-border/50">
          <div className="flex items-center gap-2.5 border-border/50 border-b bg-muted/30 px-4 py-2.5">
            <h2 className="font-medium text-sm">Artifacts</h2>
            <span className="text-muted-foreground text-xs">
              Grouped by content hash — two files sharing a name but differing
              by a byte are two artifacts here
            </span>
          </div>
          {artifacts.length === 0 && (
            <p className="px-4 py-6 text-center text-muted-foreground text-sm">
              Nothing to inventory yet. Artifacts appear after a machine checks
              in.
            </p>
          )}
          <ul className="divide-y divide-border/40">
            {artifacts.map((artifact) => (
              <li key={`${artifact.tool}-${artifact.kind}-${artifact.name}`}>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                  onClick={() =>
                    setExpanded(
                      expanded === artifact.name ? null : artifact.name
                    )
                  }
                  type="button"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {artifact.name}
                      </span>
                      {hasMultipleVariants(artifact) && (
                        <Badge
                          className="font-normal text-xs"
                          variant="secondary"
                        >
                          {artifact.variants.length} distinct files
                        </Badge>
                      )}
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {artifact.tool} · {artifact.kind}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {artifact.machineCount} machine
                      {artifact.machineCount === 1 ? "" : "s"}
                    </span>
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground"
                        style={{
                          width: `${fleetShare(artifact.machineCount, hosts.length)}%`,
                        }}
                      />
                    </div>
                  </div>
                </button>
                {expanded === artifact.name && (
                  <ul className="border-border/40 border-t bg-muted/20">
                    {orderVariants(artifact.variants).map((variant) => (
                      <li
                        className="flex items-center gap-3 py-2 pr-4 pl-8"
                        key={variant.contentHash}
                      >
                        <span className="font-mono text-muted-foreground text-xs">
                          {shortHash(variant.contentHash)}
                        </span>
                        <span className="truncate font-mono text-muted-foreground text-xs">
                          {variant.paths[0]}
                        </span>
                        <span className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums">
                          {variant.machineCount} machine
                          {variant.machineCount === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {view === "people" && (
        <div className="overflow-hidden rounded-xl border border-border/50">
          <div className="flex items-center gap-2.5 border-border/50 border-b bg-muted/30 px-4 py-2.5">
            <h2 className="font-medium text-sm">People</h2>
            <span className="text-muted-foreground text-xs">
              Who is accountable for each machine
            </span>
          </div>
          <ul className="divide-y divide-border/40">
            {owners.map(([owner, machines]) => (
              <li className="flex items-start gap-3 px-4 py-3" key={owner}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{owner}</p>
                  <p className="text-muted-foreground text-xs">
                    {machines[0].host.team ?? "No team recorded"}
                  </p>
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {machines.map((m) => (
                    <button
                      className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs hover:bg-muted/70"
                      key={m.host.id}
                      onClick={() => setSelectedHostId(m.host.id)}
                      type="button"
                    >
                      {m.host.hostname}
                    </button>
                  ))}
                </div>
                <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                  {machines.length} machine{machines.length === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view === "machines" && isLoading && (
        <p className="text-muted-foreground text-sm">Loading machines…</p>
      )}

      {view === "machines" && !isLoading && hosts.length === 0 && (
        <EmptyFleet />
      )}

      {view === "machines" && hosts.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border/50">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-border/50 border-b bg-muted/30 text-left text-muted-foreground text-xs uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">Machine</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Tools</th>
                <th className="px-4 py-2.5 text-right font-medium">Skills</th>
                <th className="px-4 py-2.5 text-right font-medium">Configs</th>
                <th className="px-4 py-2.5 text-right font-medium">
                  Last report
                </th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((entry) => {
                const freshness = getHostFreshness(
                  new Date(entry.host.lastSeenAt)
                );

                return (
                  <tr
                    className="cursor-pointer border-border/40 border-b last:border-b-0 transition-colors hover:bg-muted/40"
                    key={entry.host.id}
                    onClick={() => setSelectedHostId(entry.host.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <ServerIcon className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {entry.host.hostname}
                          </p>
                          <p className="truncate text-muted-foreground text-xs">
                            {[entry.host.username, entry.host.platform]
                              .filter(Boolean)
                              .join(" · ") || entry.host.machineId}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={cn(
                          "border-transparent font-medium",
                          freshnessClasses[freshness]
                        )}
                        variant="outline"
                      >
                        {freshnessLabel[freshness]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {entry.toolNames.length === 0 && (
                          <span className="text-muted-foreground text-xs">
                            none
                          </span>
                        )}
                        {entry.toolNames.slice(0, 3).map((tool) => (
                          <Badge
                            className="font-normal text-xs"
                            key={tool}
                            variant="secondary"
                          >
                            {tool}
                          </Badge>
                        ))}
                        {entry.toolNames.length > 3 && (
                          <Badge
                            className="font-normal text-xs"
                            variant="secondary"
                          >
                            +{entry.toolNames.length - 3}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {entry.skillsTotal}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {entry.configsTotal}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground text-xs tabular-nums">
                      {formatRelativeTime(new Date(entry.host.lastSeenAt))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Sheet
        onOpenChange={(open) => !open && setSelectedHostId(null)}
        open={selectedHostId !== null}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{detail?.host.hostname ?? "Machine"}</SheetTitle>
            <SheetDescription>
              {detail
                ? [
                    detail.host.platform,
                    detail.host.osRelease,
                    detail.host.agentVersion
                      ? `agent ${detail.host.agentVersion}`
                      : null,
                    detail.kbVersion ? `kb ${detail.kbVersion}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Loading…"}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-2 px-4 pb-8">
            {detail?.items.length === 0 && (
              <p className="text-muted-foreground text-sm">
                This machine reported no AI tooling.
              </p>
            )}
            {detail?.items.map((item) => (
              <div
                className="rounded-lg border border-border/50 p-3"
                key={`${item.tool}-${item.path}`}
              >
                <div className="flex items-center gap-2">
                  {item.kind === "skill" ? (
                    <SparklesIcon className="size-3.5 text-muted-foreground" />
                  ) : (
                    <PackageIcon className="size-3.5 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm">{item.tool}</span>
                  <Badge className="font-normal text-xs" variant="secondary">
                    {item.kind}
                  </Badge>
                  <Badge className="font-normal text-xs" variant="outline">
                    {item.scope}
                  </Badge>
                  {!item.exists && (
                    <Badge className="font-normal text-xs" variant="outline">
                      missing
                    </Badge>
                  )}
                </div>
                <p className="mt-1.5 break-all font-mono text-muted-foreground text-xs">
                  {item.path}
                </p>
                {item.riskSurface.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.riskSurface.map((risk) => (
                      <Badge
                        className="border-amber-500/30 bg-amber-500/10 font-normal text-amber-600 text-xs dark:text-amber-400"
                        key={risk}
                        variant="outline"
                      >
                        {risk}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function EmptyFleet() {
  return (
    <div className="rounded-xl border border-border/50 border-dashed p-8 text-center">
      <LaptopIcon className="mx-auto size-8 text-muted-foreground/60" />
      <h2 className="mt-3 font-medium">No machines reporting yet</h2>
      <p className="mx-auto mt-1 max-w-md text-muted-foreground text-sm">
        Point the codegate agent at this server and it will appear here after
        its first check-in.
      </p>
      <pre className="mx-auto mt-4 w-fit overflow-x-auto rounded-lg bg-muted/60 px-4 py-3 text-left font-mono text-xs">
        {`codegate report \\
  --server ${typeof window === "undefined" ? "https://guardian.example.com" : window.location.origin} \\
  --token <AGENT_INGEST_TOKEN>`}
      </pre>
    </div>
  );
}
