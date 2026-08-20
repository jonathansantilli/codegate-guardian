import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import {
  buildCodegateScanNpxArgs,
  withCodegateNpmEnv,
} from "@/lib/security/codegate-cli";

const CODEGATE_TIMEOUT_MS = 30_000;
const CODEGATE_MAX_BUFFER = 5 * 1024 * 1024;

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

export function sanitizeRelativePath(input: string): string {
  const normalized = normalize(input).replace(/\\/g, "/");
  const safe = normalized.replace(/[^a-zA-Z0-9._/-]/g, "");

  if (!safe || isAbsolute(safe) || safe.includes("..")) {
    throw new Error("Invalid filename");
  }

  return safe;
}

export function guessConfigFilePath(
  content: string,
  filename?: string
): string {
  if (filename) {
    return filename.startsWith(".") || filename.includes("/")
      ? filename
      : `.claude/${filename}`;
  }

  const trimmed = content.trim();

  if (trimmed.includes("mcpServers") || trimmed.includes("mcp_servers")) {
    return ".claude/mcp_servers.json";
  }

  if (trimmed.startsWith("#") || trimmed.includes("<!--")) {
    return "AGENTS.md";
  }

  if (trimmed.startsWith("{")) {
    return ".claude/settings.json";
  }

  return "config.json";
}

export const analyzeConfig = tool({
  description:
    "Analyze AI coding tool configuration content for security risks. " +
    "Use this when user provides raw config JSON/TOML/YAML/Markdown and asks for a security scan.",
  inputSchema: z.object({
    content: z
      .string()
      .min(1)
      .max(200_000)
      .describe("Raw config content to analyze"),
    filename: z
      .string()
      .max(256)
      .optional()
      .describe("Optional filename hint, e.g. mcp_servers.json or AGENTS.md"),
  }),
  execute: ({ content, filename }) => {
    const id = randomUUID().slice(0, 8);
    const tmpDir = `/tmp/codegate-paste-${id}`;

    try {
      const rawPath = guessConfigFilePath(content, filename);
      const safeRelativePath = sanitizeRelativePath(rawPath);
      const fullPath = join(tmpDir, safeRelativePath);

      const rel = relative(tmpDir, fullPath);
      if (isAbsolute(rel) || rel.startsWith("..")) {
        throw new Error("Invalid filename path");
      }

      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, "utf8");

      let scannerOutput = "";
      try {
        scannerOutput = execFileSync(
          "npx",
          buildCodegateScanNpxArgs({ target: tmpDir }),
          {
            encoding: "utf8",
            timeout: CODEGATE_TIMEOUT_MS,
            maxBuffer: CODEGATE_MAX_BUFFER,
            env: withCodegateNpmEnv(),
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
        mode: "analyze_config",
        guessed_path: safeRelativePath,
        codegate_report: parsed,
      };
    } catch (error) {
      const err = error as Error;
      return {
        error: true,
        message: err.message,
      };
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  },
});
