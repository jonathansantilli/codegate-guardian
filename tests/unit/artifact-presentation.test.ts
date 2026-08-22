import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import {
  fleetShare,
  hasMultipleVariants,
  orderVariants,
  shortHash,
} from "@/lib/security/artifact-presentation";

const HASH = `sha256:${"a".repeat(56)}bcdef123`;

describe("shortHash", () => {
  test("keeps both ends so two hashes stay distinguishable", () => {
    const short = shortHash(HASH);
    assert.match(short, /^a{8}…/);
    assert.ok(short.endsWith("bcdef123"));
  });

  test("drops the sha256 prefix", () => {
    assert.ok(!shortHash(HASH).startsWith("sha256:"));
  });

  test("leaves a short value alone rather than mangling it", () => {
    assert.equal(shortHash("sha256:abc"), "abc");
  });
});

describe("hasMultipleVariants", () => {
  // The whole point of the screen: one name, several distinct files.
  test("flags a name covering more than one distinct file", () => {
    assert.equal(
      hasMultipleVariants({
        name: "SKILL.md",
        machineCount: 6,
        variants: [
          { contentHash: "sha256:a", machineCount: 3 },
          { contentHash: "sha256:b", machineCount: 3 },
        ],
      }),
      true
    );
  });

  test("does not flag a name with one file", () => {
    assert.equal(
      hasMultipleVariants({
        name: "CLAUDE.md",
        machineCount: 441,
        variants: [{ contentHash: "sha256:a", machineCount: 441 }],
      }),
      false
    );
  });
});

describe("fleetShare", () => {
  test("reports a real share of the fleet", () => {
    assert.equal(fleetShare(6, 482), 1);
    assert.equal(fleetShare(441, 482), 91);
    assert.equal(fleetShare(482, 482), 100);
  });

  // A bar that overstates spread is worse than no bar.
  test("never exceeds 100 or divides by zero", () => {
    assert.equal(fleetShare(10, 5), 100);
    assert.equal(fleetShare(1, 0), 0);
  });
});

describe("orderVariants", () => {
  test("puts the most widespread variant first", () => {
    const ordered = orderVariants([
      { contentHash: "sha256:rare", machineCount: 1 },
      { contentHash: "sha256:common", machineCount: 9 },
    ]);
    assert.equal(ordered[0].contentHash, "sha256:common");
  });

  test("does not mutate its input", () => {
    const input = [
      { contentHash: "sha256:a", machineCount: 1 },
      { contentHash: "sha256:b", machineCount: 9 },
    ];
    orderVariants(input);
    assert.equal(input[0].contentHash, "sha256:a");
  });
});
