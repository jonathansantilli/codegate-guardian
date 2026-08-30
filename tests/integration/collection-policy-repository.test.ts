import { strict as assert } from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { DrizzleFleetRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/fleet-repository";
import {
  type PostgresHarness,
  startPostgresHarness,
} from "@/tests/helpers/testcontainer-pg";

describe("Feature: the collection policy and the artifact content it admits", () => {
  let harness: PostgresHarness;
  let repository: DrizzleFleetRepository;

  before(async () => {
    harness = await startPostgresHarness();
    repository = new DrizzleFleetRepository(harness.db);
  });

  after(async () => {
    if (harness) {
      await harness.stop();
    }
  });

  beforeEach(async () => {
    await harness.resetDatabase();
  });

  // The default has to be closed, and it has to be closed on a database that
  // has never been configured — which is every database, once.
  it("Given a database nobody has configured, when the policy is read, then it collects nothing", async () => {
    const policy = await repository.getCollectionPolicy();

    assert.equal(policy.collectContent, false);
    assert.deepEqual(policy.allowedRiskSurfaces, []);
    assert.equal(policy.updatedBy, null);
  });

  it("Given a saved policy, when it is read back, then it is what was saved", async () => {
    const updatedAt = new Date("2026-08-30T10:00:00Z");
    await repository.saveCollectionPolicy({
      collectContent: true,
      allowedRiskSurfaces: ["prompt_injection", "unicode_backdoor"],
      maxBytesPerArtifact: 4096,
      maxArtifactsPerReport: 25,
      updatedBy: "operator@example.test",
      updatedAt,
    });

    const policy = await repository.getCollectionPolicy();
    assert.equal(policy.collectContent, true);
    assert.deepEqual(policy.allowedRiskSurfaces, [
      "prompt_injection",
      "unicode_backdoor",
    ]);
    assert.equal(policy.maxBytesPerArtifact, 4096);
    assert.equal(policy.updatedBy, "operator@example.test");
    assert.deepEqual(policy.updatedAt, updatedAt);
  });

  // One instance, one policy. A second save must replace the first rather than
  // leave two rows and a coin toss about which one an agent is told.
  it("Given the policy is saved twice, when it is read, then there is one policy and it is the newer", async () => {
    await repository.saveCollectionPolicy({
      collectContent: true,
      allowedRiskSurfaces: ["prompt_injection"],
      maxBytesPerArtifact: 1024,
      maxArtifactsPerReport: 10,
      updatedBy: "first@example.test",
      updatedAt: new Date("2026-08-30T10:00:00Z"),
    });
    await repository.saveCollectionPolicy({
      collectContent: false,
      allowedRiskSurfaces: [],
      maxBytesPerArtifact: 2048,
      maxArtifactsPerReport: 20,
      updatedBy: "second@example.test",
      updatedAt: new Date("2026-08-30T11:00:00Z"),
    });

    const policy = await repository.getCollectionPolicy();
    assert.equal(policy.collectContent, false);
    assert.equal(policy.updatedBy, "second@example.test");
  });

  it("Given artifact content, when it is stored, then it is counted once", async () => {
    const stored = await repository.storeArtifactContents([
      {
        contentHash: `sha256:${"a".repeat(64)}`,
        byteLength: 12,
        content: "# Rules\n\nx\n",
        riskSurface: ["prompt_injection"],
        firstSeenAt: new Date("2026-08-30T10:00:00Z"),
      },
    ]);

    assert.equal(stored, 1);
  });

  /**
   * The payoff of keying storage by hash: forty machines carrying the same
   * skill is one row and one analysis, not forty copies of the same text.
   */
  it("Given a second machine carries the same artifact, when it is stored again, then nothing new is written", async () => {
    const entry = {
      contentHash: `sha256:${"b".repeat(64)}`,
      byteLength: 12,
      content: "# Rules\n\nx\n",
      riskSurface: ["prompt_injection"],
      firstSeenAt: new Date("2026-08-30T10:00:00Z"),
    };

    assert.equal(await repository.storeArtifactContents([entry]), 1);
    assert.equal(
      await repository.storeArtifactContents([
        { ...entry, firstSeenAt: new Date("2026-08-30T11:00:00Z") },
      ]),
      0
    );
    assert.deepEqual(
      await repository.findStoredArtifactHashes([entry.contentHash]),
      [entry.contentHash]
    );
  });

  it("Given a mix of held and new hashes, when they are looked up, then only the held ones come back", async () => {
    const held = `sha256:${"c".repeat(64)}`;
    const absent = `sha256:${"d".repeat(64)}`;
    await repository.storeArtifactContents([
      {
        contentHash: held,
        byteLength: 3,
        content: "x\n",
        riskSurface: ["prompt_injection"],
        firstSeenAt: new Date("2026-08-30T10:00:00Z"),
      },
    ]);

    assert.deepEqual(
      await repository.findStoredArtifactHashes([held, absent]),
      [held]
    );
    assert.deepEqual(await repository.findStoredArtifactHashes([]), []);
  });

  // Chunking is invisible until it is not: content rows are large, so the
  // insert is chunked far more tightly than inventory rows.
  it("Given more artifacts than one insert chunk, when they are stored, then all of them are", async () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({
      contentHash: `sha256:${i.toString(16).padStart(64, "0")}`,
      byteLength: 4,
      content: `# ${i}\n`,
      riskSurface: ["prompt_injection"],
      firstSeenAt: new Date("2026-08-30T10:00:00Z"),
    }));

    assert.equal(await repository.storeArtifactContents(entries), 60);
    assert.equal(
      (
        await repository.findStoredArtifactHashes(
          entries.map((e) => e.contentHash)
        )
      ).length,
      60
    );
  });
});
