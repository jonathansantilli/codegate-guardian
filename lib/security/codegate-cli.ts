import { accessSync, constants, mkdirSync } from "node:fs";
import { join } from "node:path";

const CODEGATE_NPM_PACKAGE = "codegate-ai";
const DEFAULT_RUNTIME_HOME = "/tmp";
const DEFAULT_NPM_CACHE = "/tmp/.npm";

function resolveWritableHome(homeCandidate?: string) {
  const normalized = homeCandidate?.trim();
  if (normalized) {
    try {
      mkdirSync(normalized, { recursive: true });
      accessSync(normalized, constants.W_OK);
      return normalized;
    } catch {
      // fall back below
    }
  }

  mkdirSync(DEFAULT_RUNTIME_HOME, { recursive: true });
  return DEFAULT_RUNTIME_HOME;
}

export function buildCodegateScanNpxArgs({
  target,
  skillName,
}: {
  target: string;
  skillName?: string;
}) {
  const args = ["--yes", CODEGATE_NPM_PACKAGE, "scan", target];

  if (skillName) {
    args.push("--skill", skillName);
  }

  args.push("--force", "--format", "json", "--no-tui");

  return args;
}

export function withCodegateNpmEnv(env: NodeJS.ProcessEnv = process.env) {
  const home = resolveWritableHome(env.HOME);
  const codegateHome = env.CODEGATE_HOME?.trim() || join(home, ".codegate");
  const npmCache = env.npm_config_cache?.trim() || DEFAULT_NPM_CACHE;

  mkdirSync(codegateHome, { recursive: true });
  mkdirSync(npmCache, { recursive: true });

  return {
    ...env,
    HOME: home,
    CODEGATE_HOME: codegateHome,
    npm_config_cache: npmCache,
  };
}
