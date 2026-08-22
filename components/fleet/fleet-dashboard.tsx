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
  formatRelativeTime,
  getHostFreshness,
  type HostFreshness,
} from "@/lib/security/fleet-presentation";
import { cn, fetcher } from "@/lib/utils";

type HostSummary = {
  host: {
    id: string;
    machineId: string;
    hostname: string;
    platform: string | null;
    osRelease: string | null;
    username: string | null;
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

  const { data, isLoading } = useSWR<{ hosts: HostSummary[] }>(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/fleet`,
    fetcher,
    { refreshInterval: 30_000 }
  );

  const { data: detail } = useSWR<HostDetail>(
    selectedHostId
      ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/fleet/host?hostId=${selectedHostId}`
      : null,
    fetcher
  );

  const hosts = data?.hosts ?? [];
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
          label="Not reporting"
          value={totals.stale}
        />
      </div>

      {isLoading && (
        <p className="text-muted-foreground text-sm">Loading machines…</p>
      )}

      {!isLoading && hosts.length === 0 && <EmptyFleet />}

      {hosts.length > 0 && (
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
