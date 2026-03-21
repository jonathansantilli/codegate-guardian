"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { extractScanReportView } from "@/lib/security/scan-report-view";
import { FindingCard } from "./finding-card";
import { SeverityBar } from "./severity-bar";

export function ScanReport({
  toolName,
  output,
}: {
  toolName: "scanGithubRepo" | "analyzeConfig";
  output: unknown;
}) {
  const report = extractScanReportView({ toolName, output });

  if (report.kind === "error") {
    return (
      <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-red-200 text-sm">
        {report.message}
      </div>
    );
  }

  if (report.kind === "needs-skill-selection") {
    return (
      <div className="space-y-2 rounded-lg border border-amber-300/30 bg-amber-500/10 p-3">
        <p className="text-sm">{report.message}</p>
        <div className="flex flex-wrap gap-1.5">
          {report.availableSkills.map((skill) => (
            <Badge className="rounded-full" key={skill} variant="outline">
              {skill}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  if (report.kind === "empty") {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-muted-foreground text-sm">
        {report.message}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 text-xs">
        {report.repositoryUrl && (
          <Badge className="rounded-full" variant="outline">
            Repo: {report.repositoryUrl}
          </Badge>
        )}
        {report.selectedSkill && (
          <Badge className="rounded-full" variant="outline">
            Skill: {report.selectedSkill}
          </Badge>
        )}
        {report.guessedPath && (
          <Badge className="rounded-full" variant="outline">
            Path: {report.guessedPath}
          </Badge>
        )}
      </div>

      {report.message && (
        <p className="text-muted-foreground text-xs">{report.message}</p>
      )}

      <SeverityBar
        bySeverity={report.bySeverity}
        riskScore={report.riskScore}
        total={report.total}
      />

      {report.total === 0 ? (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-emerald-100 text-sm">
          No findings reported for this scan.
        </div>
      ) : (
        <div className="space-y-2">
          {report.findings.map((finding, index) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 8 }}
              key={finding.findingId}
              transition={{ delay: index * 0.06, duration: 0.16 }}
            >
              <FindingCard finding={finding} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
