import { execFileSync } from "node:child_process";
import { tool } from "ai";
import { z } from "zod";

const CODEGATE_TIMEOUT_MS = 120_000;
const CODEGATE_MAX_BUFFER = 10 * 1024 * 1024;
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

type CodegateError = Error & { stdout?: string };

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

export const scanGithubRepo = tool({
  description:
    "Scan a public GitHub repository URL for AI coding tool security risks using CodeGate. " +
    "Use this when a user shares a repository URL and asks for security findings.",
  inputSchema: z.object({
    repositoryUrl: z
      .string()
      .min(1)
      .max(2048)
      .describe("GitHub repository URL to scan"),
  }),
  execute: ({ repositoryUrl }) => {
    try {
      const normalizedUrl = normalizeGithubRepositoryUrl(repositoryUrl);

      let scannerOutput = "";
      try {
        scannerOutput = execFileSync(
          "npx",
          [
            "codegate-ai",
            "scan",
            normalizedUrl,
            "--no-tui",
            "--format",
            "json",
          ],
          {
            encoding: "utf8",
            timeout: CODEGATE_TIMEOUT_MS,
            maxBuffer: CODEGATE_MAX_BUFFER,
          }
        );
      } catch (error) {
        const err = error as CodegateError;
        if (err.stdout?.trim()) {
          scannerOutput = err.stdout;
        } else {
          throw error;
        }
      }

      const parsed = tryParseJson(scannerOutput);

      return {
        mode: "scan_github_repo",
        repository_url: normalizedUrl,
        codegate_report: parsed,
      };
    } catch (error) {
      const err = error as Error;
      return {
        error: true,
        message: err.message,
      };
    }
  },
});
