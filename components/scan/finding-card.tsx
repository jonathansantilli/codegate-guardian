"use client";

import { ChevronDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type {
  ScanFindingView,
  ScanSeverity,
} from "@/src/domain/reporting/services/scan-report-view";

const severityClasses: Record<
  ScanSeverity,
  {
    border: string;
    badge: string;
  }
> = {
  CRITICAL: {
    border: "border-red-600/40",
    badge: "bg-red-600 text-white hover:bg-red-600",
  },
  HIGH: {
    border: "border-orange-500/40",
    badge: "bg-orange-500 text-white hover:bg-orange-500",
  },
  MEDIUM: {
    border: "border-amber-400/40",
    badge: "bg-amber-400 text-black hover:bg-amber-400",
  },
  LOW: {
    border: "border-sky-500/40",
    badge: "bg-sky-500 text-white hover:bg-sky-500",
  },
  INFO: {
    border: "border-slate-400/40",
    badge: "bg-slate-500 text-white hover:bg-slate-500",
  },
};

export function FindingCard({ finding }: { finding: ScanFindingView }) {
  const severityStyle = severityClasses[finding.severity];

  return (
    <Collapsible
      className={cn(
        "rounded-lg border border-border/60 bg-background/80",
        severityStyle.border
      )}
      defaultOpen={false}
    >
      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn("rounded-full text-xs", severityStyle.badge)}>
            {finding.severity}
          </Badge>
          <Badge className="rounded-full text-xs" variant="outline">
            {finding.category}
          </Badge>
          {finding.filePath && (
            <span className="truncate text-muted-foreground text-xs">
              {finding.filePath}
            </span>
          )}
        </div>

        <p className="text-sm">{finding.description}</p>

        <CollapsibleTrigger className="group inline-flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground">
          Details
          <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-2 text-xs">
          {finding.evidence && (
            <div className="rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-5">
              {finding.evidence}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {finding.cwe && (
              <Badge className="rounded-full" variant="secondary">
                {finding.cwe}
              </Badge>
            )}
            {finding.confidence && (
              <Badge className="rounded-full" variant="secondary">
                Confidence: {finding.confidence}
              </Badge>
            )}
            {finding.layer && (
              <Badge className="rounded-full" variant="secondary">
                Layer: {finding.layer}
              </Badge>
            )}
            {finding.ruleId && (
              <Badge className="rounded-full" variant="secondary">
                Rule: {finding.ruleId}
              </Badge>
            )}
            {finding.owasp.map((tag) => (
              <Badge className="rounded-full" key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
