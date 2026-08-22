import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The credential one machine reports with.
 *
 * Every enrolled machine gets its own token, and the server identifies the
 * machine by the token rather than by the id in the request body. Without
 * that, a single shared secret let any agent holding it claim any other
 * machine's identity — and since a finding is resolved by being absent from a
 * later report, one hostile agent could mark every machine in the fleet clean.
 */

/** 256 bits, url-safe, prefixed so it is recognisable in a config file. */
export function mintMachineToken(): string {
  return `cgm_${randomBytes(32).toString("base64url")}`;
}

/**
 * What the server stores. Tokens are looked up by this, so a database that
 * leaks does not hand over working credentials for the whole fleet.
 */
export function hashMachineToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison of two token hashes. */
export function machineTokenMatches(
  presentedHash: string,
  storedHash: string
): boolean {
  const a = Buffer.from(presentedHash, "utf8");
  const b = Buffer.from(storedHash, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}
