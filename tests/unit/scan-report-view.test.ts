import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import {
  calculateRiskScore,
  extractScanReportView,
  severityOrder,
} from "@/lib/security/scan-report-view";

describe("scan report view", () => {
  test("extracts report data and sorts findings by severity", () => {
    const report = extractScanReportView({
      toolName: "scanGithubRepo",
      output: {
        mode: "scan_github_repo",
        repository_url: "https://github.com/acme/repo",
        selected_skill: "skill-a",
        codegate_report: {
          findings: [
            {
              finding_id: "low-1",
              severity: "LOW",
              category: "RULE_INJECTION",
              description: "low",
            },
            {
              finding_id: "critical-1",
              severity: "CRITICAL",
              category: "COMMAND_EXEC",
              description: "critical",
            },
            {
              finding_id: "medium-1",
              severity: "MEDIUM",
              category: "CONSENT_BYPASS",
              description: "medium",
            },
          ],
          summary: {
            total: 3,
            by_severity: {
              CRITICAL: 1,
              MEDIUM: 1,
              LOW: 1,
            },
          },
        },
      },
    });

    assert.equal(report.kind, "report");
    assert.equal(report.total, 3);
    assert.equal(report.repositoryUrl, "https://github.com/acme/repo");
    assert.equal(report.selectedSkill, "skill-a");
    assert.deepEqual(
      report.findings.map((finding) => finding.findingId),
      ["critical-1", "medium-1", "low-1"]
    );
    assert.deepEqual(report.bySeverity, {
      CRITICAL: 1,
      HIGH: 0,
      MEDIUM: 1,
      LOW: 1,
      INFO: 0,
    });
    assert.equal(report.riskScore > 0, true);
  });

  test("returns selection state when skills are required", () => {
    const report = extractScanReportView({
      toolName: "scanGithubRepo",
      output: {
        needs_skill_selection: true,
        available_skills: ["a", "b"],
        message: "Pick one",
      },
    });

    assert.equal(report.kind, "needs-skill-selection");
    assert.deepEqual(report.availableSkills, ["a", "b"]);
  });

  test("returns error state for failed scan output", () => {
    const report = extractScanReportView({
      toolName: "analyzeConfig",
      output: {
        error: true,
        message: "Scan failed",
      },
    });

    assert.equal(report.kind, "error");
    assert.equal(report.message, "Scan failed");
  });

  test("risk score grows with severity weights", () => {
    const lowOnly = calculateRiskScore({
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 1,
      INFO: 0,
    });

    const withCritical = calculateRiskScore({
      CRITICAL: 1,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 1,
      INFO: 0,
    });

    assert.equal(severityOrder[0], "CRITICAL");
    assert.equal(withCritical > lowOnly, true);
  });
});
