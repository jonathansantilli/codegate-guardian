import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import {
  type Dirent,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { tool } from "ai";
import { z } from "zod";
import {
  buildCodegateScanNpxArgs,
  withCodegateNpmEnv,
} from "@/lib/security/codegate-cli";

const CODEGATE_TIMEOUT_MS = 120_000;
const CODEGATE_MAX_BUFFER = 10 * 1024 * 1024;
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const SKILL_MARKER_FILE = "SKILL.md";
const SKILL_SEGMENT_PATTERN = /^[a-zA-Z0-9._/-]+$/;

type CodegateError = Error & { stdout?: string; stderr?: string };

type SkillScanMode = "repository" | "skills";

type SkillScanRequest = {
  scanMode: SkillScanMode;
  skillName?: string;
  availableSkills: string[];
};

type SkillScanDecision =
  | { action: "scan-repository" }
  | { action: "scan-skill"; skillName: string; autoSelected: boolean }
  | { action: "scan-all-skills"; skillNames: string[] }
  | { action: "needs-selection"; availableSkills: string[] }
  | { action: "invalid-skill"; skillName: string; availableSkills: string[] }
  | { action: "no-skills" };

class SkillSelectionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillSelectionRequiredError";
  }
}

export function isSkillSelectionRequiredMessage(message: string) {
  return (
    /multiple skills detected/i.test(message) ||
    /(choose|specify).*(--skill|skill)/i.test(message)
  );
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {
      error: true,
      message: "Failed to parse scanner output as JSON",
      rawOutput: value,
    };
  }
}

function sanitizeRepositorySegment(value: string, segmentType: string) {
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    throw new Error(`Invalid GitHub ${segmentType}`);
  }
  return trimmed;
}

export function normalizeGithubRepositoryUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Repository URL is required");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(withProtocol);
  } catch {
    throw new Error("Invalid repository URL");
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (!GITHUB_HOSTS.has(hostname)) {
    throw new Error(
      "Unsupported repository URL: only github.com repositories are allowed"
    );
  }

  const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
  if (pathSegments.length < 2) {
    throw new Error("Invalid GitHub repository path");
  }

  const owner = sanitizeRepositorySegment(pathSegments[0], "owner");
  const repo = sanitizeRepositorySegment(
    pathSegments[1].replace(/\.git$/i, ""),
    "repository name"
  );

  return `https://github.com/${owner}/${repo}`;
}

export function isGithubRepositoryUrl(input: string) {
  try {
    normalizeGithubRepositoryUrl(input);
    return true;
  } catch {
    return false;
  }
}

function normalizeSkillName(input: string) {
  const trimmed = input
    .trim()
    .replace(/^skills\//iu, "")
    .replace(/\/+$/u, "");
  if (!trimmed || !SKILL_SEGMENT_PATTERN.test(trimmed)) {
    throw new Error("Invalid skill name");
  }
  return trimmed;
}

export function extractSkillNameFromRelativePath(relativePath: string) {
  const normalizedPath = relativePath.replace(/\\/g, "/").replace(/^\/+/g, "");
  const segments = normalizedPath.split("/").filter(Boolean);

  if (segments.length < 3 || segments.at(-1) !== SKILL_MARKER_FILE) {
    return null;
  }

  if (!segments.includes("skills")) {
    return null;
  }

  const parent = segments.at(-2);
  if (!parent || parent === "skills") {
    return null;
  }

  return parent;
}

function discoverSkillFiles(
  rootDir: string,
  dir = rootDir,
  results: string[] = []
) {
  let entries: Dirent[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name === ".git") {
      continue;
    }

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      discoverSkillFiles(rootDir, fullPath, results);
      continue;
    }

    if (entry.isFile() && entry.name === SKILL_MARKER_FILE) {
      results.push(relative(rootDir, fullPath));
    }
  }

  return results;
}

function discoverSkillsInRepository(repoDir: string) {
  if (!existsSync(repoDir)) {
    return [];
  }

  try {
    if (!statSync(repoDir).isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const skillNames = new Set<string>();
  const skillFiles = discoverSkillFiles(repoDir);

  for (const skillFile of skillFiles) {
    const skillName = extractSkillNameFromRelativePath(skillFile);
    if (skillName) {
      skillNames.add(skillName);
    }
  }

  return [...skillNames].sort((left, right) => left.localeCompare(right));
}

export function routeSkillScanRequest({
  scanMode,
  skillName,
  availableSkills,
}: SkillScanRequest): SkillScanDecision {
  if (scanMode === "repository") {
    return { action: "scan-repository" };
  }

  if (availableSkills.length === 0) {
    return { action: "no-skills" };
  }

  if (skillName) {
    const normalizedSelection = skillName.trim().toLowerCase();
    if (normalizedSelection === "all" || normalizedSelection === "*") {
      return { action: "scan-all-skills", skillNames: availableSkills };
    }

    const normalized = normalizeSkillName(skillName);
    if (!availableSkills.includes(normalized)) {
      return {
        action: "invalid-skill",
        skillName: normalized,
        availableSkills,
      };
    }
    return { action: "scan-skill", skillName: normalized, autoSelected: false };
  }

  if (availableSkills.length === 1) {
    const onlySkill = availableSkills[0];
    if (!onlySkill) {
      return { action: "no-skills" };
    }

    return {
      action: "scan-skill",
      skillName: onlySkill,
      autoSelected: true,
    };
  }

  return { action: "needs-selection", availableSkills };
}

async function cloneRepository(url: string, destination: string) {
  await git.clone({
    fs,
    http,
    dir: destination,
    url,
    singleBranch: true,
    depth: 1,
  });
}

function runCodegateScan(target: string, skillName?: string) {
  const args = buildCodegateScanNpxArgs({
    target,
    skillName,
  });

  let scannerOutput = "";
  try {
    scannerOutput = execFileSync("npx", args, {
      encoding: "utf8",
      timeout: CODEGATE_TIMEOUT_MS,
      maxBuffer: CODEGATE_MAX_BUFFER,
      env: withCodegateNpmEnv(),
    });
  } catch (error) {
    const err = error as CodegateError;
    if (err.stdout?.trim()) {
      scannerOutput = err.stdout;
    } else if (err.stderr?.trim()) {
      const stderr = err.stderr.trim();
      if (isSkillSelectionRequiredMessage(stderr)) {
        throw new SkillSelectionRequiredError(stderr);
      }
      throw new Error(stderr);
    } else {
      throw error;
    }
  }

  return tryParseJson(scannerOutput);
}

type CodegateReport = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mergeCodegateReports(reports: CodegateReport[]) {
  const normalizedReports = reports.map((report) => asRecord(report)).filter(Boolean);

  const baseReport = normalizedReports[0];
  if (!baseReport) {
    return {
      findings: [],
      summary: {
        total: 0,
        by_severity: {
          CRITICAL: 0,
          HIGH: 0,
          MEDIUM: 0,
          LOW: 0,
          INFO: 0,
        },
        fixable: 0,
        suppressed: 0,
        exit_code: 0,
      },
    };
  }

  const toolsDetected = new Set<string>();
  const uniqueFindings: Record<string, unknown>[] = [];
  const findingKeys = new Set<string>();

  for (const report of normalizedReports) {
    const reportRecord = asRecord(report);
    if (!reportRecord) {
      continue;
    }

    const tools = Array.isArray(reportRecord.tools_detected)
      ? reportRecord.tools_detected
      : [];
    for (const tool of tools) {
      const normalizedTool = asString(tool);
      if (normalizedTool) {
        toolsDetected.add(normalizedTool);
      }
    }

    const findings = Array.isArray(reportRecord.findings)
      ? reportRecord.findings
      : [];
    for (const finding of findings) {
      const findingRecord = asRecord(finding);
      if (!findingRecord) {
        continue;
      }

      const findingKey = [
        findingRecord.finding_id ?? "",
        findingRecord.rule_id ?? "",
        findingRecord.file_path ?? "",
        findingRecord.severity ?? "",
        findingRecord.description ?? "",
      ].join("|");

      if (findingKeys.has(findingKey)) {
        continue;
      }

      findingKeys.add(findingKey);
      uniqueFindings.push(findingRecord);
    }
  }

  const bySeverity = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
  };
  let fixable = 0;
  let suppressed = 0;

  for (const finding of uniqueFindings) {
    const severity = asString(finding.severity)?.toUpperCase();
    if (severity === "CRITICAL") bySeverity.CRITICAL += 1;
    else if (severity === "HIGH") bySeverity.HIGH += 1;
    else if (severity === "MEDIUM") bySeverity.MEDIUM += 1;
    else if (severity === "LOW") bySeverity.LOW += 1;
    else bySeverity.INFO += 1;

    if (finding.fixable === true) {
      fixable += 1;
    }
    if (finding.suppressed === true) {
      suppressed += 1;
    }
  }

  return {
    ...baseReport,
    findings: uniqueFindings,
    tools_detected: [...toolsDetected],
    summary: {
      total: uniqueFindings.length,
      by_severity: bySeverity,
      fixable,
      suppressed,
      exit_code: uniqueFindings.length > 0 ? 2 : 0,
    },
  };
}

export const scanGithubRepo = tool({
  description:
    "Scan a public GitHub repository URL for AI coding tool security risks using CodeGate. " +
    "Supports repository-wide scans and interactive skill-focused scans.",
  inputSchema: z.object({
    repositoryUrl: z
      .string()
      .min(1)
      .max(2048)
      .describe("GitHub repository URL to scan"),
    scanMode: z
      .enum(["repository", "skills"])
      .optional()
      .default("repository")
      .describe("Scan mode: repository-wide scan or skill-focused scan"),
    skillName: z
      .string()
      .min(1)
      .max(256)
      .optional()
      .describe("Optional skill name when scanMode is skills"),
  }),
  execute: async ({ repositoryUrl, scanMode, skillName }) => {
    try {
      const normalizedUrl = normalizeGithubRepositoryUrl(repositoryUrl);
      const tempRoot = mkdtempSync(join(tmpdir(), "codegate-scan-repo-"));
      const repoDir = join(tempRoot, "repo");

      try {
        let repositoryReport: CodegateReport | null = null;
        let repositoryScanNeedsSkillSelection = false;
        try {
          await cloneRepository(normalizedUrl, repoDir);
        } catch (error) {
          const cloneError = error as Error;
          throw new Error(
            `Unable to fetch repository from GitHub (${normalizedUrl}): ${cloneError.message}`
          );
        }
        const availableSkills = discoverSkillsInRepository(repoDir);

        if (scanMode === "repository") {
          try {
            repositoryReport = runCodegateScan(repoDir);
          } catch (error) {
            if (error instanceof SkillSelectionRequiredError) {
              repositoryScanNeedsSkillSelection = true;
            } else {
              throw error;
            }
          }
        }

        if (
          scanMode === "repository" &&
          repositoryScanNeedsSkillSelection &&
          !repositoryReport
        ) {
          try {
            repositoryReport = runCodegateScan(repoDir);
            repositoryScanNeedsSkillSelection = false;
          } catch {
            // Keep the skill-selection flow even if local fallback fails.
          }
        }

        const decision = routeSkillScanRequest({
          scanMode,
          skillName,
          availableSkills,
        });

        if (decision.action === "needs-selection") {
          return {
            mode: "scan_github_repo",
            scan_mode: scanMode,
            repository_url: normalizedUrl,
            needs_skill_selection: true,
            skills_detected_count: decision.availableSkills.length,
            available_skills: decision.availableSkills,
            ...(repositoryReport && { codegate_report: repositoryReport }),
            message:
              scanMode === "repository"
                ? repositoryScanNeedsSkillSelection
                  ? "Multiple skills were detected. Please pick one skill to scan, or say 'all' to scan all skills."
                  : "Repository scan completed. Multiple skills were detected. Reply with one skill name to scan it, or say 'all' to scan all skills."
                : "Multiple skills found in this repository. Please choose one skill to scan, or say 'all' to scan all skills.",
          };
        }

        if (decision.action === "invalid-skill") {
          return {
            error: true,
            mode: "scan_github_repo",
            scan_mode: scanMode,
            repository_url: normalizedUrl,
            needs_skill_selection: false,
            skills_detected_count: decision.availableSkills.length,
            invalid_skill: decision.skillName,
            available_skills: decision.availableSkills,
            message: `Skill "${decision.skillName}" was not found in this repository.`,
          };
        }

        if (decision.action === "no-skills") {
          return {
            mode: "scan_github_repo",
            scan_mode: scanMode,
            repository_url: normalizedUrl,
            needs_skill_selection: false,
            skills_detected_count: 0,
            available_skills: [],
            ...(repositoryReport && { codegate_report: repositoryReport }),
            message:
              "No skills were found in this repository under any */skills/*/SKILL.md path.",
          };
        }

        if (decision.action === "scan-repository") {
          const baseRepositoryReport = repositoryReport;

          if (availableSkills.length === 1) {
            const autoSkill = availableSkills[0];
            if (!autoSkill) {
              throw new Error("No auto-selected skill available");
            }
            const skillReport = runCodegateScan(repoDir, autoSkill);
            const mergedReport = baseRepositoryReport
              ? mergeCodegateReports([baseRepositoryReport, skillReport])
              : skillReport;

            return {
              mode: "scan_github_repo",
              scan_mode: scanMode,
              repository_url: normalizedUrl,
              needs_skill_selection: false,
              skills_detected_count: availableSkills.length,
              available_skills: availableSkills,
              selected_skill: autoSkill,
              auto_selected_skill: true,
              codegate_report: mergedReport,
              ...(baseRepositoryReport && {
                repository_codegate_report: baseRepositoryReport,
              }),
              skill_codegate_report: skillReport,
              message: baseRepositoryReport
                ? `Repository scan completed. One skill was detected ("${autoSkill}") and scanned automatically.`
                : `One skill was detected ("${autoSkill}") and scanned automatically.`,
            };
          }

          if (availableSkills.length > 1 && repositoryScanNeedsSkillSelection) {
            const fallbackSkill = availableSkills[0];
            if (!fallbackSkill) {
              throw new Error("No fallback skill available");
            }

            try {
              const skillReport = runCodegateScan(repoDir, fallbackSkill);
              const mergedReport = baseRepositoryReport
                ? mergeCodegateReports([baseRepositoryReport, skillReport])
                : skillReport;
              const remainingSkills = availableSkills.filter(
                (skill) => skill !== fallbackSkill
              );

              return {
                mode: "scan_github_repo",
                scan_mode: scanMode,
                repository_url: normalizedUrl,
                needs_skill_selection: true,
                skills_detected_count: availableSkills.length,
                available_skills: availableSkills,
                selected_skill: fallbackSkill,
                auto_selected_skill: true,
                remaining_skills: remainingSkills,
                codegate_report: mergedReport,
                ...(baseRepositoryReport && {
                  repository_codegate_report: baseRepositoryReport,
                }),
                skill_codegate_report: skillReport,
                message: `Multiple skills were detected. I auto-scanned "${fallbackSkill}" so you already have an initial skills result. Reply with any other skill name to scan it, or say 'all' to scan all remaining skills.`,
              };
            } catch {
              return {
                mode: "scan_github_repo",
                scan_mode: scanMode,
                repository_url: normalizedUrl,
                needs_skill_selection: true,
                skills_detected_count: availableSkills.length,
                available_skills: availableSkills,
                ...(baseRepositoryReport && {
                  codegate_report: baseRepositoryReport,
                }),
                message:
                  "Multiple skills were detected. Please pick one skill to scan, or say 'all' to scan all skills.",
              };
            }
          }

          if (!baseRepositoryReport && repositoryScanNeedsSkillSelection) {
            return {
              mode: "scan_github_repo",
              scan_mode: scanMode,
              repository_url: normalizedUrl,
              needs_skill_selection: availableSkills.length > 1,
              skills_detected_count: availableSkills.length,
              available_skills: availableSkills,
              message:
                availableSkills.length > 1
                  ? "Multiple skills were detected. Please pick one skill to scan, or say 'all' to scan all skills."
                  : "Repository scan requires selecting a skill first.",
            };
          }

          if (!baseRepositoryReport) {
            throw new Error("Repository scan did not produce a report");
          }

          return {
            mode: "scan_github_repo",
            scan_mode: scanMode,
            repository_url: normalizedUrl,
            needs_skill_selection: availableSkills.length > 1,
            skills_detected_count: availableSkills.length,
            available_skills: availableSkills,
            codegate_report: baseRepositoryReport,
            message:
              availableSkills.length > 1
                ? "Repository scan completed. Multiple skills were detected. Reply with one skill name to scan it, or say 'all' to scan all skills."
                : null,
          };
        }

        if (decision.action === "scan-all-skills") {
          const skillReports = decision.skillNames.map((currentSkill) => ({
            skill: currentSkill,
            report: runCodegateScan(repoDir, currentSkill),
          }));
          const mergedReport = mergeCodegateReports(
            skillReports.map((currentReport) => currentReport.report)
          );

          return {
            mode: "scan_github_repo",
            scan_mode: scanMode,
            repository_url: normalizedUrl,
            needs_skill_selection: false,
            skills_detected_count: decision.skillNames.length,
            available_skills: decision.skillNames,
            selected_skill: "all",
            scanned_skills: decision.skillNames,
            codegate_report: mergedReport,
            codegate_report_by_skill: skillReports.map((currentReport) => ({
              skill: currentReport.skill,
              codegate_report: currentReport.report,
            })),
            message: `Scanned all ${decision.skillNames.length} detected skills.`,
          };
        }

        const parsed = runCodegateScan(repoDir, decision.skillName);
        return {
          mode: "scan_github_repo",
          scan_mode: scanMode,
          repository_url: normalizedUrl,
          needs_skill_selection: false,
          skills_detected_count: availableSkills.length,
          selected_skill: decision.skillName,
          auto_selected_skill: decision.autoSelected,
          message: decision.autoSelected
            ? `One skill was detected ("${decision.skillName}"), so it was scanned automatically.`
            : `Scanning selected skill "${decision.skillName}".`,
          codegate_report: parsed,
        };
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    } catch (error) {
      const err = error as Error;
      return {
        error: true,
        message: err.message,
      };
    }
  },
});
