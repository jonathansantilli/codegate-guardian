/**
 * Reads an agent's bearer token off a request.
 *
 * What the token means is decided elsewhere: the server looks up the machine
 * it belongs to (lib/security/machine-token.ts). This file only parses the
 * header.
 */

const BEARER_PREFIX = /^Bearer\s+/i;

export function extractBearerToken(
  authorizationHeader: string | null
): string | undefined {
  if (!authorizationHeader || !BEARER_PREFIX.test(authorizationHeader)) {
    return;
  }

  const token = authorizationHeader.replace(BEARER_PREFIX, "").trim();
  return token.length > 0 ? token : undefined;
}
