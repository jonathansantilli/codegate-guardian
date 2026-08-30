/**
 * Which artifacts may ever have their bytes sent to this server.
 *
 * The agent's knowledge base tags every artifact it knows about with the risk
 * surfaces it represents. That tagging is what makes an upload rule
 * enforceable rather than aspirational: "skills and rules files, not configs"
 * is a sentence, but "every declared surface must be in this list" is a check.
 *
 * Allowlisted, not denylisted, and deliberately. A surface added to the
 * knowledge base later — for a tool nobody has written support for yet — is
 * refused here until somebody widens this list on purpose. The failure mode of
 * a denylist is that new things are uploaded because nobody remembered to
 * exclude them, and on this particular path that means shipping a developer's
 * credentials to a server.
 *
 * The three below are prose surfaces: instructions, hidden characters in
 * instructions, and shell commands embedded in instructions. They describe
 * markdown a model can usefully read. Everything else the knowledge base
 * declares — mcp_config, env_override, ide_settings, provider_credentials,
 * secret_leak, channel_token and the rest — sits on files whose whole purpose
 * is to hold configuration, which is where API keys live.
 *
 * NOTE: `codegate`'s own copy of this list is the one that actually protects a
 * developer, because it runs on their machine and this server does not. This
 * copy stops a mis-set policy turning the console into a place credentials are
 * kept. Both sides enforce it; neither trusts the other to have done so.
 */
export const UPLOADABLE_RISK_SURFACES: readonly string[] = [
  "prompt_injection",
  "unicode_backdoor",
  "command_exec",
];

/**
 * True when every surface the artifact declares is uploadable.
 *
 * An artifact with no declared surface is refused rather than allowed: an
 * empty list means the knowledge base said nothing about it, which is not the
 * same as saying it is safe.
 */
export function isUploadableSurface(riskSurface: readonly string[]): boolean {
  if (riskSurface.length === 0) {
    return false;
  }
  return riskSurface.every((surface) =>
    UPLOADABLE_RISK_SURFACES.includes(surface)
  );
}
