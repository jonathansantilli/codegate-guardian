const CODEGATE_NPM_PACKAGE = "codegate-ai";

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
  return {
    ...env,
    npm_config_cache: env.npm_config_cache || "/tmp/.npm",
  };
}
