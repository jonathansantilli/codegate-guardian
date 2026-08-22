"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SeverityCounts } from "@/src/domain/reporting/services/scan-report-view";

const severityMeta: Array<{
  key: keyof SeverityCounts;
  label: string;
  barClassName: string;
}> = [
  {
    key: "CRITICAL",
    label: "Critical",
    barClassName: "bg-red-600",
  },
  {
    key: "HIGH",
    label: "High",
    barClassName: "bg-orange-500",
  },
  {
    key: "MEDIUM",
    label: "Medium",
    barClassName: "bg-amber-400",
  },
  {
    key: "LOW",
    label: "Low",
    barClassName: "bg-sky-500",
  },
  {
    key: "INFO",
    label: "Info",
    barClassName: "bg-slate-400",
  },
];

export function SeverityBar({
  bySeverity,
  total,
  riskScore,
}: {
  bySeverity: SeverityCounts;
  total: number;
  riskScore: number;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-sm">
          {total} finding{total === 1 ? "" : "s"}
        </div>
        <Badge className="rounded-full" variant="secondary">
          Risk score: {riskScore}/100
        </Badge>
      </div>

      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {severityMeta.map((severity) => {
          const count = bySeverity[severity.key];
          const width = total > 0 ? (count / total) * 100 : 0;

          return (
            <div
              className={cn(severity.barClassName, width <= 0 && "hidden")}
              key={severity.key}
              style={{ width: `${width}%` }}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        {severityMeta.map((severity) => (
          <Badge className="rounded-full" key={severity.key} variant="outline">
            {severity.label}: {bySeverity[severity.key]}
          </Badge>
        ))}
      </div>
    </div>
  );
}
