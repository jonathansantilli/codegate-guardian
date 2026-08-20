import { timingSafeEqual } from "node:crypto";

/**
 * Verifies an agent's bearer token against the configured ingest token.
 *
 * Compared in constant time: a token checked with `===` leaks its prefix
 * through response timing, and agents authenticate on every check-in, which
 * gives an attacker as many samples as they care to take.
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

export function isValidAgentToken(
  presented: string | undefined,
  expected: string | undefined
): boolean {
  // No configured token means ingest is closed, never open to everyone.
  if (!(expected && presented)) {
    return false;
  }

  const presentedBytes = Buffer.from(presented, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // expected length; compare against a same-length buffer and fold the length
  // check into the result instead.
  if (presentedBytes.length !== expectedBytes.length) {
    timingSafeEqual(expectedBytes, expectedBytes);
    return false;
  }

  return timingSafeEqual(presentedBytes, expectedBytes);
}
