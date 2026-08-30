import { strict as assert } from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";
import {
  acceptArtifactContent,
  CONTENT_REFUSAL,
  type ContentPolicy,
} from "@/lib/security/accept-artifact-content";

function hash(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

const OPEN: ContentPolicy = {
  collectContent: true,
  allowedRiskSurfaces: ["prompt_injection", "unicode_backdoor", "command_exec"],
  maxBytesPerArtifact: 1024,
  maxArtifactsPerReport: 10,
};

const RULES_FILE = "# Rules\n\nAlways run the tests.\n";
const RULES_HASH = hash(RULES_FILE);

function inventory(riskSurface: string[], sha256 = RULES_HASH) {
  return [{ sha256, riskSurface }];
}

describe("Feature: what a server accepts when an agent offers file contents", () => {
  test("Given collection is off, when content is offered, then none is kept", () => {
    const result = acceptArtifactContent(
      [{ sha256: RULES_HASH, content: RULES_FILE }],
      inventory(["prompt_injection"]),
      { ...OPEN, collectContent: false }
    );

    assert.equal(result.accepted.length, 0);
    assert.equal(result.refused[0]?.reason, CONTENT_REFUSAL.NotCollecting);
  });

  test("Given an allowed surface, when content is offered, then it is kept with its surfaces", () => {
    const result = acceptArtifactContent(
      [{ sha256: RULES_HASH, content: RULES_FILE }],
      inventory(["prompt_injection", "unicode_backdoor"]),
      OPEN
    );

    assert.equal(result.refused.length, 0);
    assert.equal(result.accepted.length, 1);
    assert.equal(result.accepted[0].contentHash, RULES_HASH);
    assert.equal(
      result.accepted[0].byteLength,
      Buffer.byteLength(RULES_FILE, "utf8")
    );
    assert.deepEqual(result.accepted[0].riskSurface, [
      "prompt_injection",
      "unicode_backdoor",
    ]);
  });

  // The whole point of the allowlist: mcp_config is where API keys live.
  test("Given an artifact carrying a credential-bearing surface, when it is offered, then it is refused", () => {
    const result = acceptArtifactContent(
      [{ sha256: RULES_HASH, content: RULES_FILE }],
      inventory(["prompt_injection", "mcp_config"]),
      {
        ...OPEN,
        allowedRiskSurfaces: [...OPEN.allowedRiskSurfaces, "mcp_config"],
      }
    );

    assert.equal(result.accepted.length, 0);
    assert.equal(result.refused[0]?.reason, CONTENT_REFUSAL.SurfaceNotAllowed);
  });

  test("Given a policy narrower than the build allows, when a surface sits outside it, then it is refused", () => {
    const result = acceptArtifactContent(
      [{ sha256: RULES_HASH, content: RULES_FILE }],
      inventory(["command_exec"]),
      { ...OPEN, allowedRiskSurfaces: ["prompt_injection"] }
    );

    assert.equal(result.accepted.length, 0);
    assert.equal(result.refused[0]?.reason, CONTENT_REFUSAL.SurfaceNotAllowed);
  });

  test("Given an artifact no inventory row claims, when it is offered, then it is refused", () => {
    const result = acceptArtifactContent(
      [{ sha256: hash("something else"), content: "something else" }],
      inventory(["prompt_injection"]),
      OPEN
    );

    assert.equal(result.accepted.length, 0);
    assert.equal(result.refused[0]?.reason, CONTENT_REFUSAL.UnknownArtifact);
  });

  // Storage is keyed by hash: bytes filed under a hash they do not have would
  // corrupt every identity claim built on content addressing.
  test("Given bytes that do not hash to the name they were filed under, when offered, then they are refused", () => {
    const result = acceptArtifactContent(
      [{ sha256: RULES_HASH, content: "not the file that was hashed" }],
      inventory(["prompt_injection"]),
      OPEN
    );

    assert.equal(result.accepted.length, 0);
    assert.equal(result.refused[0]?.reason, CONTENT_REFUSAL.HashMismatch);
  });

  test("Given content larger than the policy permits, when offered, then it is refused", () => {
    const big = "x".repeat(2000);
    const result = acceptArtifactContent(
      [{ sha256: hash(big), content: big }],
      inventory(["prompt_injection"], hash(big)),
      OPEN
    );

    assert.equal(result.accepted.length, 0);
    assert.equal(result.refused[0]?.reason, CONTENT_REFUSAL.TooLarge);
  });

  // Bytes, not characters — a cap measured in characters is not a cap on cost.
  test("Given multi-byte characters, when the cap is measured, then it counts bytes", () => {
    const multibyte = "😀".repeat(300);
    const result = acceptArtifactContent(
      [{ sha256: hash(multibyte), content: multibyte }],
      inventory(["prompt_injection"], hash(multibyte)),
      { ...OPEN, maxBytesPerArtifact: 600 }
    );

    assert.equal(multibyte.length, 600);
    assert.equal(result.refused[0]?.reason, CONTENT_REFUSAL.TooLarge);
  });

  test("Given more artifacts than the per-report limit, when offered, then the excess is refused", () => {
    const offered = Array.from({ length: 5 }, (_, i) => {
      const content = `# file ${i}\n`;
      return { sha256: hash(content), content };
    });
    const reported = offered.map((item) => ({
      sha256: item.sha256,
      riskSurface: ["prompt_injection"],
    }));

    const result = acceptArtifactContent(offered, reported, {
      ...OPEN,
      maxArtifactsPerReport: 2,
    });

    assert.equal(result.accepted.length, 2);
    assert.equal(result.refused.length, 3);
    assert.ok(
      result.refused.every((r) => r.reason === CONTENT_REFUSAL.OverLimit)
    );
  });

  test("Given an artifact with no declared surface, when offered, then it is refused rather than assumed safe", () => {
    const result = acceptArtifactContent(
      [{ sha256: RULES_HASH, content: RULES_FILE }],
      inventory([]),
      OPEN
    );

    assert.equal(result.accepted.length, 0);
    assert.equal(result.refused[0]?.reason, CONTENT_REFUSAL.SurfaceNotAllowed);
  });

  // The same file resolved from two patterns is one artifact, and it is as
  // sensitive as the most sensitive row describing it.
  test("Given one hash on two rows, when their surfaces differ, then the union decides", () => {
    const result = acceptArtifactContent(
      [{ sha256: RULES_HASH, content: RULES_FILE }],
      [
        { sha256: RULES_HASH, riskSurface: ["prompt_injection"] },
        { sha256: RULES_HASH, riskSurface: ["mcp_config"] },
      ],
      OPEN
    );

    assert.equal(result.accepted.length, 0);
    assert.equal(result.refused[0]?.reason, CONTENT_REFUSAL.SurfaceNotAllowed);
  });

  test("Given the same artifact offered twice, when accepted, then it is stored once", () => {
    const result = acceptArtifactContent(
      [
        { sha256: RULES_HASH, content: RULES_FILE },
        { sha256: RULES_HASH, content: RULES_FILE },
      ],
      inventory(["prompt_injection"]),
      OPEN
    );

    assert.equal(result.accepted.length, 1);
    assert.equal(result.refused.length, 0);
  });
});
