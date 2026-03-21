import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import { isHackathonModeEnabled } from "@/lib/security/hackathon-mode";

describe("hackathon mode", () => {
  test("treats true-like values as enabled", () => {
    assert.equal(isHackathonModeEnabled("true"), true);
    assert.equal(isHackathonModeEnabled("TRUE"), true);
    assert.equal(isHackathonModeEnabled("1"), true);
    assert.equal(isHackathonModeEnabled("yes"), true);
    assert.equal(isHackathonModeEnabled("on"), true);
  });

  test("treats other values as disabled", () => {
    assert.equal(isHackathonModeEnabled("false"), false);
    assert.equal(isHackathonModeEnabled("0"), false);
    assert.equal(isHackathonModeEnabled("no"), false);
    assert.equal(isHackathonModeEnabled(undefined), false);
  });
});
