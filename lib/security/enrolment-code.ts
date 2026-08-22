import { randomInt } from "node:crypto";

/**
 * Enrolment codes.
 *
 * Shaped to be read aloud and typed by hand: an operator dictates one over a
 * call, or pastes it into an MDM profile. The alphabet excludes characters
 * that are misread in that setting — O/0, I/1/L — because a code that fails
 * on a typo is worse than a slightly longer one.
 */

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUP_SIZE = 4;
const GROUPS = 2;
export const CODE_PREFIX = "FLEET";
const CODE_PATTERN = new RegExp(
  `^${CODE_PREFIX}(?:-[${ALPHABET}]{${GROUP_SIZE}}){${GROUPS}}$`
);

export function generateEnrolmentCode(
  randomIndex: (max: number) => number = (max) => randomInt(max)
): string {
  const groups = Array.from({ length: GROUPS }, () =>
    Array.from(
      { length: GROUP_SIZE },
      () => ALPHABET[randomIndex(ALPHABET.length)]
    ).join("")
  );
  return [CODE_PREFIX, ...groups].join("-");
}

export function isEnrolmentCode(value: string): boolean {
  return CODE_PATTERN.test(value.trim().toUpperCase());
}

/** Normalizes what a human typed: case and stray spaces are not meaningful. */
export function normalizeEnrolmentCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}
