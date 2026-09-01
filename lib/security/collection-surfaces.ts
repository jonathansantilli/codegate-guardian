/**
 * Which artifacts may ever have their bytes sent to this server.
 *
 * Two questions, asked in that order. How is the file written — is it prose a
 * person wrote for a model to read, or is it configuration? And does anything
 * the agent's knowledge base says about it mean it holds a credential?
 *
 * Format is the load-bearing one. "Skills and rules files, not configs" is a
 * sentence; "the file must be markdown or text" is a check, and it is the check
 * that matches what the sentence meant. Deciding on declared risk surfaces
 * alone got it wrong in both directions, and both directions mattered: it
 * refused the artifact this product exists to look at hardest, and it admitted
 * files that can hold an API key.
 *
 * NOTE: `codegate`'s own copy of these rules is the one that actually protects
 * a developer, because it runs on their machine and this server does not. This
 * copy stops a mis-set policy turning the console into a place credentials are
 * kept. Both sides enforce it; neither trusts the other to have done so.
 */

/**
 * Formats whose files are prose.
 *
 * This is the question that actually matters for an upload: not what the file
 * is *about*, but how it is written. Markdown and text hold instructions a
 * person wrote for a model to read. jsonc, json, toml, yaml and dotenv hold
 * configuration, and configuration is where credentials live — a .toml command
 * definition can carry an API key in an env block exactly as settings.json
 * does, whether or not anybody thought to tag it that way.
 *
 * Deciding on risk_surface alone got this wrong in both directions: it refused
 * a Claude Code SKILL.md because the entry declares mcp_config — which
 * means the skill can influence MCP configuration, not that the markdown holds
 * a key — and it admitted .cline/workflows.json and the Gemini command .toml files
 * because those happen to declare nothing credential-shaped.
 */
export const UPLOADABLE_FORMATS: readonly string[] = ["markdown", "text"];

/**
 * True when the artifact is written as prose.
 *
 * An artifact with no format is refused. Absent means the agent predates the
 * field or its knowledge base does not describe the file, and neither is
 * evidence that the file is safe to send.
 */
export function isUploadableFormat(format: string | null | undefined): boolean {
  return typeof format === "string" && UPLOADABLE_FORMATS.includes(format);
}

/**
 * Surfaces that mean the file holds credentials, whatever its format says.
 *
 * The ceiling the operator cannot raise. Requiring every declared surface to
 * sit in a three-name allowlist refused a Claude Code SKILL.md, which
 * declares mcp_config because a skill can influence MCP configuration — not
 * because the markdown holds a key. Which risks an operator collects content
 * for is their choice; what is never collected is a file holding a secret,
 * and format decides most of that with these as the backstop.
 */
export const CREDENTIAL_SURFACES: readonly string[] = [
  "env_override",
  "provider_credentials",
  "secret_leak",
  "channel_token",
  "ide_settings",
];

/** True when no surface the artifact declares means it holds a credential. */
export function isCredentialFree(riskSurface: readonly string[]): boolean {
  return (
    riskSurface.length > 0 &&
    !riskSurface.some((s) => CREDENTIAL_SURFACES.includes(s))
  );
}
