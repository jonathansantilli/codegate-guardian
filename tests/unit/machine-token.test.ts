import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import {
  hashMachineToken,
  machineTokenMatches,
  mintMachineToken,
} from "@/lib/security/machine-token";

describe("machine tokens", () => {
  test("a minted token is recognisable and long enough to be unguessable", () => {
    const token = mintMachineToken();
    assert.ok(token.startsWith("cgm_"));
    // 32 bytes base64url is 43 characters.
    assert.equal(token.length, "cgm_".length + 43);
  });

  test("two mints never collide", () => {
    const tokens = new Set(
      Array.from({ length: 500 }, () => mintMachineToken())
    );
    assert.equal(tokens.size, 500);
  });

  test("the stored form is a hash, not the token", () => {
    const token = mintMachineToken();
    const stored = hashMachineToken(token);
    assert.notEqual(stored, token);
    assert.ok(!stored.includes(token.slice(4)));
    assert.match(stored, /^[0-9a-f]{64}$/);
  });

  test("hashing is stable, so a token presented twice looks up the same row", () => {
    const token = mintMachineToken();
    assert.equal(hashMachineToken(token), hashMachineToken(token));
  });

  test("a matching hash is accepted and a different one is not", () => {
    const stored = hashMachineToken(mintMachineToken());
    assert.ok(machineTokenMatches(stored, stored));
    assert.ok(
      !machineTokenMatches(hashMachineToken(mintMachineToken()), stored)
    );
  });

  test("a hash of the wrong length is rejected rather than throwing", () => {
    assert.doesNotThrow(() =>
      machineTokenMatches("short", hashMachineToken("x"))
    );
    assert.ok(!machineTokenMatches("short", hashMachineToken("x")));
  });
});
