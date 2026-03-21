import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tool } from "ai";
import { z } from "zod";

const CODEGATE_TIMEOUT_MS = 120_000;
const CODEGATE_MAX_BUFFER = 10 * 1024 * 1024;
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const SKILLS_DIR = "skills";
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
  | { action: "needs-selection"; availableSkills: string[] }
  | { action: "invalid-skill"; skillName: string; availableSkills: string[] }
  | { action: "no-skills" };

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

function discoverSkillsInRepository(repoDir: string) {
  const skillsRoot = join(repoDir, SKILLS_DIR);
  if (!existsSync(skillsRoot)) {
    return [];
  }

  try {
    if (!statSync(skillsRoot).isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(skillsRoot, name, SKILL_MARKER_FILE)))
    .sort((left, right) => left.localeCompare(right));
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

function cloneRepository(url: string, destination: string) {
  execFileSync(
    "git",
    [
      "clone",
      "--quiet",
      "--depth",
      "1",
      "--filter=blob:none",
      url,
      destination,
    ],
    {
      encoding: "utf8",
      timeout: CODEGATE_TIMEOUT_MS,
      maxBuffer: CODEGATE_MAX_BUFFER,
    }
  );
}

function runCodegateScan(target: string, skillName?: string) {
  const args = ["codegate-ai", "scan", target];

  if (skillName) {
    args.push("--skill", skillName);
  }

  args.push("--no-tui", "--format", "json");

  let scannerOutput = "";
  try {
    scannerOutput = execFileSync("npx", args, {
      encoding: "utf8",
      timeout: CODEGATE_TIMEOUT_MS,
      maxBuffer: CODEGATE_MAX_BUFFER,
    });
  } catch (error) {
    const err = error as CodegateError;
    if (err.stdout?.trim()) {
      scannerOutput = err.stdout;
    } else if (err.stderr?.trim()) {
      throw new Error(err.stderr.trim());
    } else {
      throw error;
    }
  }

  return tryParseJson(scannerOutput);
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
  execute: ({ repositoryUrl, scanMode, skillName }) => {
    try {
      const normalizedUrl = normalizeGithubRepositoryUrl(repositoryUrl);
      const tempRoot = mkdtempSync(join(tmpdir(), "codegate-scan-repo-"));
      const repoDir = join(tempRoot, "repo");

      try {
        cloneRepository(normalizedUrl, repoDir);
        const availableSkills = discoverSkillsInRepository(repoDir);
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
            message:
              "Multiple skills found in this repository. Please choose one skill to scan.",
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
            message:
              "No skills were found in this repository under skills/*/SKILL.md.",
          };
        }

        if (decision.action === "scan-repository") {
          const parsed = runCodegateScan(repoDir);
          return {
            mode: "scan_github_repo",
            scan_mode: scanMode,
            repository_url: normalizedUrl,
            needs_skill_selection: false,
            skills_detected_count: availableSkills.length,
            available_skills: availableSkills,
            codegate_report: parsed,
          };
        }

        const parsed = runCodegateScan(normalizedUrl, decision.skillName);
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
