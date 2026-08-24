import { timingSafeEqual } from "node:crypto";

/**
 * The token that claims an unclaimed instance.
 *
 * A fresh install must let someone become the first operator, and until that
 * happens anyone who can reach the port could have. Requiring a value the
 * operator set before starting the container narrows that window to whoever
 * deployed it.
 */

export function isValidSetupToken(
  presented: string | undefined,
  expected: string | undefined
): boolean {
  // No configured token means an unclaimed instance stays unclaimed. Failing
  // open here would be the whole point of the token, undone.
  if (!(expected && presented)) {
    return false;
  }

  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");

  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // expected length; fold the length check into the result instead.
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }

  return timingSafeEqual(a, b);
}
