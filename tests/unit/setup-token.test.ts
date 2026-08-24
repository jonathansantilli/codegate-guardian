import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import { isValidSetupToken } from "@/lib/security/setup-token";

describe("isValidSetupToken", () => {
  test("accepts the configured token", () => {
    assert.equal(isValidSetupToken("s3tup-token", "s3tup-token"), true);
  });

  test("rejects a wrong token of the same length", () => {
    assert.equal(isValidSetupToken("s3tup-tokeX", "s3tup-token"), false);
  });

  test("rejects tokens of a different length without throwing", () => {
    assert.doesNotThrow(() => isValidSetupToken("short", "s3tup-token"));
    assert.equal(isValidSetupToken("short", "s3tup-token"), false);
    assert.equal(isValidSetupToken("s3tup-token-longer", "s3tup-token"), false);
  });

  test("an unconfigured token cannot be satisfied, not even by an empty one", () => {
    // Fail closed: the alternative is an open door on a fleet console.
    assert.equal(isValidSetupToken("anything", undefined), false);
    assert.equal(isValidSetupToken("anything", ""), false);
    assert.equal(isValidSetupToken("", ""), false);
    assert.equal(isValidSetupToken(undefined, "s3tup-token"), false);
  });
});
