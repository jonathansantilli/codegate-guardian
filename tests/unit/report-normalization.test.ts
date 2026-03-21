import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import { extractNormalizedScanRunsFromMessage } from "@/lib/security/report-normalization";

describe("report normalization", () => {
  test("extracts a repository scan run and normalizes findings", () => {
    const createdAt = new Date("2026-03-21T12:00:00.000Z");
    const [run] = extractNormalizedScanRunsFromMessage({
      chatId: "chat-1",
      id: "msg-1",
      createdAt,
      parts: [
        {
          type: "tool-scanGithubRepo",
          toolCallId: "tool-1",
          state: "output-available",
          output: {
            mode: "scan_github_repo",
            scan_mode: "skills",
            repository_url: "https://github.com/vercel-labs/skills",
            selected_skill: "find-skills",
            codegate_report: {
              findings: [
                {
                  finding_id: "finding-1",
                  rule_id: "RULE-001",
                  severity: "critical",
                  category: "COMMAND_EXEC",
                  layer: "L2",
                  file_path: "skills/find-skills/SKILL.md",
                  description: "Dangerous command pattern",
                  evidence: "curl | sh",
                  owasp: ["ASI02"],
                  cwe: "CWE-78",
                  confidence: "HIGH",
                  fixable: false,
                },
              ],
              summary: {
                total: 1,
                by_severity: {
                  CRITICAL: 1,
                },
              },
            },
          },
        },
      ],
    });

    assert.equal(run.toolName, "scanGithubRepo");
    assert.equal(run.toolCallId, "tool-1");
    assert.equal(run.scanMode, "skills");
    assert.equal(run.repositoryUrl, "https://github.com/vercel-labs/skills");
    assert.equal(run.selectedSkill, "find-skills");
    assert.equal(run.findingsTotal, 1);
    assert.deepEqual(run.summaryBySeverity, { CRITICAL: 1 });

    assert.equal(run.findings.length, 1);
    assert.equal(run.findings[0]?.severity, "CRITICAL");
    assert.equal(run.findings[0]?.findingId, "finding-1");
    assert.equal(run.findings[0]?.category, "COMMAND_EXEC");
    assert.equal(run.findings[0]?.filePath, "skills/find-skills/SKILL.md");
  });

  test("extracts analyze_config run and creates stable fallback finding id", () => {
    const [run] = extractNormalizedScanRunsFromMessage({
      chatId: "chat-2",
      id: "msg-2",
      createdAt: new Date("2026-03-21T13:00:00.000Z"),
      parts: [
        {
          type: "tool-analyzeConfig",
          toolCallId: "tool-2",
          state: "output-available",
          output: {
            mode: "analyze_config",
            guessed_path: ".claude/settings.json",
            codegate_report: {
              findings: [
                {
                  severity: "high",
                  description: "Unsafe setting",
                  file_path: ".claude/settings.json",
                },
              ],
            },
          },
        },
      ],
    });

    assert.equal(run.toolName, "analyzeConfig");
    assert.equal(run.guessedPath, ".claude/settings.json");
    assert.equal(run.findings.length, 1);
    assert.equal(run.findings[0]?.severity, "HIGH");
    assert.equal(
      run.findings[0]?.findingId,
      "tool-2:.claude/settings.json:high:0"
    );
  });

  test("ignores tool parts without a completed CodeGate report", () => {
    const runs = extractNormalizedScanRunsFromMessage({
      chatId: "chat-3",
      id: "msg-3",
      createdAt: new Date("2026-03-21T14:00:00.000Z"),
      parts: [
        {
          type: "tool-scanGithubRepo",
          toolCallId: "tool-3",
          state: "input-available",
          input: { repositoryUrl: "https://github.com/vercel/ai" },
        },
        {
          type: "tool-scanGithubRepo",
          toolCallId: "tool-4",
          state: "output-available",
          output: {
            mode: "scan_github_repo",
            needs_skill_selection: true,
            available_skills: ["a", "b"],
          },
        },
      ],
    });

    assert.equal(runs.length, 0);
  });
});
