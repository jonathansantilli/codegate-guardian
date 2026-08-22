import { strict as assert } from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { RecordHostReportInput } from "@/src/application/ports/fleet/fleet-repository";
import { DrizzleFleetRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/fleet-repository";
import {
  type PostgresHarness,
  startPostgresHarness,
} from "@/tests/helpers/testcontainer-pg";

const MACHINE_A = "machine-aaaa-1111";
const MACHINE_B = "machine-bbbb-2222";

function report(
  overrides: Partial<RecordHostReportInput> = {}
): RecordHostReportInput {
  const receivedAt = overrides.receivedAt ?? new Date("2026-08-20T12:00:00Z");
  return {
    machineId: MACHINE_A,
    hostname: "dev-laptop",
    platform: "darwin",
    osRelease: "24.6.0",
    username: "jsantilli",
    agentVersion: "1.1.0",
    collectedAt: receivedAt,
    receivedAt,
    kbVersion: "2026-08-20",
    toolsDetected: [{ name: "claude-code", version_range: ">=1.0.0" }],
    items: [
      {
        tool: "claude-code",
        kind: "skill",
        itemType: "directory",
        scope: "user",
        pattern: ".claude/skills/*/SKILL.md",
        path: "/Users/jsantilli/.claude/skills/podcast/SKILL.md",
        exists: true,
        contentHash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        riskSurface: ["prompt-injection"],
        resolvedAgainst: "/Users/jsantilli",
      },
      {
        tool: "cursor",
        kind: "config",
        itemType: null,
        scope: "project",
        pattern: ".cursor/mcp.json",
        path: "/repo/.cursor/mcp.json",
        exists: true,
        contentHash: null,
        riskSurface: [],
        resolvedAgainst: "/repo",
      },
    ],
    ...overrides,
  };
}

describe("Feature: FleetRepository (Drizzle-Postgres)", () => {
  let harness: PostgresHarness;
  let repository: DrizzleFleetRepository;

  before(async () => {
    harness = await startPostgresHarness();
    repository = new DrizzleFleetRepository(harness.db);
  });

  after(async () => {
    if (harness) await harness.stop();
  });

  beforeEach(async () => {
    await harness.resetDatabase();
  });

  it("Given no machines have reported, when listHostSummaries runs, then it returns nothing", async () => {
    assert.deepEqual(await repository.listHostSummaries(), []);
  });

  it("Given a first check-in, when listHostSummaries runs, then the machine appears with its inventory counts", async () => {
    await repository.recordReport(report());

    const summaries = await repository.listHostSummaries();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].host.machineId, MACHINE_A);
    assert.equal(summaries[0].host.hostname, "dev-laptop");
    assert.equal(summaries[0].itemsTotal, 2);
    assert.equal(summaries[0].skillsTotal, 1);
    assert.equal(summaries[0].configsTotal, 1);
    assert.deepEqual(summaries[0].toolNames, ["claude-code", "cursor"]);
  });

  // The machine is identified by machineId, so a laptop that reports twice is
  // one host with two reports, not two hosts.
  it("Given the same machine reports twice, when listHostSummaries runs, then there is still one host", async () => {
    const first = await repository.recordReport(report());
    const second = await repository.recordReport(
      report({ receivedAt: new Date("2026-08-20T13:00:00Z") })
    );

    assert.equal(first.hostId, second.hostId);
    assert.notEqual(first.reportId, second.reportId);

    const summaries = await repository.listHostSummaries();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].lastReportId, second.reportId);
  });

  it("Given a machine was renamed, when it reports again, then the new hostname is shown and first-seen is preserved", async () => {
    await repository.recordReport(report());
    await repository.recordReport(
      report({
        hostname: "dev-laptop-renamed",
        agentVersion: "1.2.0",
        receivedAt: new Date("2026-08-21T09:00:00Z"),
      })
    );

    const [summary] = await repository.listHostSummaries();
    assert.equal(summary.host.hostname, "dev-laptop-renamed");
    assert.equal(summary.host.agentVersion, "1.2.0");
    assert.deepEqual(
      summary.host.firstSeenAt,
      new Date("2026-08-20T12:00:00Z")
    );
    assert.deepEqual(summary.host.lastSeenAt, new Date("2026-08-21T09:00:00Z"));
  });

  // Counts must describe the machine as it is now, not the union of every
  // check-in it has ever made.
  it("Given a skill was uninstalled, when the machine reports again, then counts reflect only the latest report", async () => {
    await repository.recordReport(report());
    await repository.recordReport(
      report({
        receivedAt: new Date("2026-08-21T09:00:00Z"),
        items: [
          {
            tool: "cursor",
            kind: "config",
            itemType: null,
            scope: "project",
            pattern: ".cursor/mcp.json",
            path: "/repo/.cursor/mcp.json",
            exists: true,
            contentHash: null,
            riskSurface: [],
            resolvedAgainst: "/repo",
          },
        ],
      })
    );

    const [summary] = await repository.listHostSummaries();
    assert.equal(summary.itemsTotal, 1);
    assert.equal(summary.skillsTotal, 0);
    assert.equal(summary.configsTotal, 1);
    assert.deepEqual(summary.toolNames, ["cursor"]);
  });

  it("Given an item that no longer exists on disk, when counting, then it is excluded", async () => {
    await repository.recordReport(
      report({
        items: [
          {
            tool: "claude-code",
            kind: "skill",
            itemType: "directory",
            scope: "user",
            pattern: ".claude/skills/*/SKILL.md",
            path: "/Users/jsantilli/.claude/skills/gone/SKILL.md",
            exists: false,
            contentHash: null,
            riskSurface: [],
            resolvedAgainst: "/Users/jsantilli",
          },
        ],
      })
    );

    const [summary] = await repository.listHostSummaries();
    assert.equal(summary.itemsTotal, 0);
    assert.deepEqual(summary.toolNames, []);
  });

  it("Given several machines, when listHostSummaries runs, then the most recently seen comes first", async () => {
    await repository.recordReport(
      report({ receivedAt: new Date("2026-08-20T10:00:00Z") })
    );
    await repository.recordReport(
      report({
        machineId: MACHINE_B,
        hostname: "ci-runner",
        receivedAt: new Date("2026-08-20T18:00:00Z"),
      })
    );

    const summaries = await repository.listHostSummaries();
    assert.equal(summaries.length, 2);
    assert.equal(summaries[0].host.hostname, "ci-runner");
    assert.equal(summaries[1].host.hostname, "dev-laptop");
  });

  it("Given a known host id, when findHostDetail runs, then the latest report's items are returned", async () => {
    const { hostId } = await repository.recordReport(report());

    const detail = await repository.findHostDetail(hostId);
    assert.ok(detail);
    assert.equal(detail.host.machineId, MACHINE_A);
    assert.equal(detail.kbVersion, "2026-08-20");
    assert.equal(detail.items.length, 2);
    assert.equal(detail.items[0].tool, "claude-code");
    assert.deepEqual(detail.items[0].riskSurface, ["prompt-injection"]);
  });

  it("Given an unknown host id, when findHostDetail runs, then it returns null", async () => {
    assert.equal(
      await repository.findHostDetail("00000000-0000-0000-0000-000000000000"),
      null
    );
  });

  it("Given a report with many items, when stored, then every item is persisted across insert chunks", async () => {
    const manyItems = Array.from({ length: 1200 }, (_, index) => ({
      tool: "claude-code",
      kind: "skill" as const,
      itemType: null,
      scope: "user" as const,
      pattern: ".claude/skills/*/SKILL.md",
      path: `/Users/jsantilli/.claude/skills/skill-${index}/SKILL.md`,
      exists: true,
      contentHash: null,
      riskSurface: [],
      resolvedAgainst: "/Users/jsantilli",
    }));

    const { hostId } = await repository.recordReport(
      report({ items: manyItems })
    );

    const detail = await repository.findHostDetail(hostId);
    assert.equal(detail?.items.length, 1200);
  });
  // Identity is the content hash: same name, different bytes = two artifacts.
  it("Given two machines with same-named but different files, when grouping artifacts, then each hash is its own variant", async () => {
    const item = (hash: string) => ({
      tool: "claude-code",
      kind: "skill" as const,
      itemType: null,
      scope: "user" as const,
      pattern: ".claude/skills/podcast/SKILL.md",
      path: "/Users/x/.claude/skills/podcast/SKILL.md",
      exists: true,
      contentHash: hash,
      riskSurface: [],
      resolvedAgainst: "/Users/x",
    });
    const bad = `sha256:${"b".repeat(64)}`;
    const clean = `sha256:${"c".repeat(64)}`;

    await repository.recordReport(
      report({ machineId: "m-1", items: [item(bad)] })
    );
    await repository.recordReport(
      report({ machineId: "m-2", items: [item(bad)] })
    );
    await repository.recordReport(
      report({ machineId: "m-3", items: [item(clean)] })
    );

    const groups = await repository.listArtifactGroups();
    const podcast = groups.find((g) => g.name === "SKILL.md");

    assert.ok(podcast);
    assert.equal(podcast.variants.length, 2);
    assert.equal(podcast.machineCount, 3);
    assert.equal(podcast.variants[0].contentHash, bad);
    assert.equal(podcast.variants[0].machineCount, 2);
    assert.equal(podcast.variants[1].machineCount, 1);
  });

  it("Given an artifact removed in a later report, when grouping, then it no longer counts", async () => {
    const hash = `sha256:${"d".repeat(64)}`;
    const withItem = {
      tool: "claude-code",
      kind: "skill" as const,
      itemType: null,
      scope: "user" as const,
      pattern: "p",
      path: "/Users/x/gone/SKILL.md",
      exists: true,
      contentHash: hash,
      riskSurface: [],
      resolvedAgainst: "/Users/x",
    };

    await repository.recordReport(
      report({ machineId: "m-9", items: [withItem] })
    );
    assert.ok(
      (await repository.listArtifactGroups()).some((g) => g.name === "SKILL.md")
    );

    await repository.recordReport(
      report({
        machineId: "m-9",
        items: [],
        receivedAt: new Date("2026-08-22T09:00:00Z"),
      })
    );
    assert.equal((await repository.listArtifactGroups()).length, 0);
  });

  it("Given an item with no content hash, when grouping, then it is excluded as unidentifiable", async () => {
    await repository.recordReport(
      report({
        machineId: "m-unhashed",
        items: [
          {
            tool: "claude-code",
            kind: "skill",
            itemType: null,
            scope: "user",
            pattern: "p",
            path: "/Users/x/unhashed/SKILL.md",
            exists: true,
            contentHash: null,
            riskSurface: [],
            resolvedAgainst: "/Users/x",
          },
        ],
      })
    );
    assert.deepEqual(await repository.listArtifactGroups(), []);
  });
});
