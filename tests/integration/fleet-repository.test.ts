import { strict as assert } from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type {
  RecordFindingInput,
  RecordHostReportInput,
} from "@/src/application/ports/fleet/fleet-repository";
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
    kbVersion: "2026.08.20.1",
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
    assert.equal(detail.kbVersion, "2026.08.20.1");
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
  // One machine carrying several variants of a name is still one machine.
  it("Given one machine carries two variants of a name, when grouping, then it counts one machine", async () => {
    const item = (hash: string, path: string) => ({
      tool: "claude-code",
      kind: "skill" as const,
      itemType: null,
      scope: "user" as const,
      pattern: "p",
      path,
      exists: true,
      contentHash: hash,
      riskSurface: [],
      resolvedAgainst: "/Users/x",
    });

    await repository.recordReport(
      report({
        machineId: "m-multi",
        items: [
          item(`sha256:${"1".repeat(64)}`, "/Users/x/a/README.md"),
          item(`sha256:${"2".repeat(64)}`, "/Users/x/b/README.md"),
        ],
      })
    );

    const [group] = await repository.listArtifactGroups();
    assert.equal(group.variants.length, 2);
    assert.equal(group.machineCount, 1);
  });
});

describe("Feature: finding lifecycle (Drizzle-Postgres)", () => {
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

  const finding = (
    overrides: Partial<RecordFindingInput> = {}
  ): RecordFindingInput => ({
    findingId: "f-1",
    ruleId: "known-malicious-content",
    fingerprint: "sha256:fingerprint-1",
    severity: "CRITICAL",
    category: null,
    layer: null,
    filePath: "/Users/x/.claude/skills/podcast/SKILL.md",
    contentHash: `sha256:${"b".repeat(64)}`,
    line: null,
    column: null,
    description: "Skill matches a known-bad indicator",
    evidence: null,
    owasp: [],
    cwe: null,
    confidence: null,
    fixable: null,
    suppressed: false,
    ...overrides,
  });

  it("Given a machine reports a finding, when listing, then it is open", async () => {
    await repository.recordReport(report({ findings: [finding()] }));

    const [found] = await repository.listFindings();
    assert.equal(found.status, "open");
    assert.equal(found.machineCount, 1);
    assert.equal(found.ruleId, "known-malicious-content");
  });

  // The whole point of a report-only server: absence in a later report is the
  // only evidence of a fix that can ever exist.
  it("Given a later report no longer contains the finding, when listing, then it is resolved", async () => {
    await repository.recordReport(report({ findings: [finding()] }));
    await repository.recordReport(
      report({ findings: [], receivedAt: new Date("2026-08-22T18:00:00Z") })
    );

    const [found] = await repository.listFindings();
    assert.equal(found.status, "resolved");
    assert.equal(found.machineCount, 0);
  });

  it("Given a report that carries no findings list at all, when listing, then nothing is claimed resolved", async () => {
    await repository.recordReport(report({ findings: [finding()] }));
    // findings omitted entirely — inventory-only report, not a clean machine
    await repository.recordReport(
      report({ receivedAt: new Date("2026-08-22T18:00:00Z") })
    );

    const [found] = await repository.listFindings();
    assert.equal(found.status, "open");
  });

  it("Given two machines carry one finding, when listing, then it counts both", async () => {
    await repository.recordReport(
      report({ machineId: "m-a", findings: [finding()] })
    );
    await repository.recordReport(
      report({ machineId: "m-b", findings: [finding()] })
    );

    const [found] = await repository.listFindings();
    assert.equal(found.machineCount, 2);
  });

  it("Given one of two machines fixed it, when listing, then the finding stays open on the other", async () => {
    await repository.recordReport(
      report({ machineId: "m-a", findings: [finding()] })
    );
    await repository.recordReport(
      report({ machineId: "m-b", findings: [finding()] })
    );
    await repository.recordReport(
      report({
        machineId: "m-a",
        findings: [],
        receivedAt: new Date("2026-08-22T18:00:00Z"),
      })
    );

    const [found] = await repository.listFindings();
    assert.equal(found.status, "open");
    assert.equal(found.machineCount, 1);
  });

  it("Given a finding is acknowledged, when listing, then it shows who took it and stays open", async () => {
    const { hostId } = await repository.recordReport(
      report({ findings: [finding()] })
    );
    await repository.acknowledgeFinding({
      hostId,
      fingerprint: "sha256:fingerprint-1",
      acknowledgedBy: "Jonathan Santilli",
      acknowledgedAt: new Date("2026-08-22T12:06:00Z"),
    });

    const [found] = await repository.listFindings();
    assert.equal(found.status, "acknowledged");
    assert.equal(found.acknowledgedBy, "Jonathan Santilli");
  });

  // Acknowledging is a person taking responsibility, not evidence of a fix.
  it("Given an acknowledged finding is later absent, when listing, then it resolves anyway", async () => {
    const { hostId } = await repository.recordReport(
      report({ findings: [finding()] })
    );
    await repository.acknowledgeFinding({
      hostId,
      fingerprint: "sha256:fingerprint-1",
      acknowledgedBy: "Jonathan Santilli",
      acknowledgedAt: new Date("2026-08-22T12:06:00Z"),
    });
    await repository.recordReport(
      report({ findings: [], receivedAt: new Date("2026-08-22T18:00:00Z") })
    );

    const [found] = await repository.listFindings();
    assert.equal(found.status, "resolved");
  });

  it("Given a suppressed finding, when listing, then it is excluded", async () => {
    await repository.recordReport(
      report({ findings: [finding({ suppressed: true })] })
    );
    assert.deepEqual(await repository.listFindings(), []);
  });

  it("Given findings of mixed severity, when listing, then critical comes first", async () => {
    await repository.recordReport(
      report({
        findings: [
          finding({ fingerprint: "fp-low", severity: "LOW", findingId: "f-2" }),
          finding({
            fingerprint: "fp-crit",
            severity: "CRITICAL",
            findingId: "f-3",
          }),
          finding({
            fingerprint: "fp-med",
            severity: "MEDIUM",
            findingId: "f-4",
          }),
        ],
      })
    );

    const severities = (await repository.listFindings()).map((f) => f.severity);
    assert.deepEqual(severities, ["CRITICAL", "MEDIUM", "LOW"]);
  });

  it("Given a finding, when listing, then it carries the hash of the file it was found in", async () => {
    await repository.recordReport(report({ findings: [finding()] }));

    const [found] = await repository.listFindings();
    assert.equal(found.contentHash, `sha256:${"b".repeat(64)}`);
  });
  // A finding that was fixed and came back is not the same as one that was
  // never fixed — the operator needs to know the fix did not hold.
  it("Given a finding is fixed and then returns, when listing, then it is regressed", async () => {
    await repository.recordReport(report({ findings: [finding()] }));
    await repository.recordReport(
      report({ findings: [], receivedAt: new Date("2026-08-22T18:00:00Z") })
    );
    await repository.recordReport(
      report({
        findings: [finding()],
        receivedAt: new Date("2026-08-23T00:00:00Z"),
      })
    );

    const [found] = await repository.listFindings();
    assert.equal(found.status, "regressed");
    assert.equal(found.machineCount, 1);
  });

  it("Given a finding reported twice running, when listing, then it is merely open", async () => {
    await repository.recordReport(report({ findings: [finding()] }));
    await repository.recordReport(
      report({
        findings: [finding()],
        receivedAt: new Date("2026-08-22T18:00:00Z"),
      })
    );

    const [found] = await repository.listFindings();
    assert.equal(found.status, "open");
  });

  it("Given a regression, when it is acknowledged, then it still reads as regressed", async () => {
    const { hostId } = await repository.recordReport(
      report({ findings: [finding()] })
    );
    await repository.recordReport(
      report({ findings: [], receivedAt: new Date("2026-08-22T18:00:00Z") })
    );
    await repository.recordReport(
      report({
        findings: [finding()],
        receivedAt: new Date("2026-08-23T00:00:00Z"),
      })
    );
    await repository.acknowledgeFinding({
      hostId,
      fingerprint: "sha256:fingerprint-1",
      acknowledgedBy: "Jonathan Santilli",
      acknowledgedAt: new Date("2026-08-23T01:00:00Z"),
    });

    const [found] = await repository.listFindings();
    assert.equal(found.status, "regressed");
  });

  it("Given a regression on one machine only, when listing, then the whole finding shows it", async () => {
    await repository.recordReport(
      report({ machineId: "m-a", findings: [finding()] })
    );
    await repository.recordReport(
      report({ machineId: "m-b", findings: [finding()] })
    );
    await repository.recordReport(
      report({
        machineId: "m-a",
        findings: [],
        receivedAt: new Date("2026-08-22T18:00:00Z"),
      })
    );
    await repository.recordReport(
      report({
        machineId: "m-a",
        findings: [finding()],
        receivedAt: new Date("2026-08-23T00:00:00Z"),
      })
    );

    const [found] = await repository.listFindings();
    assert.equal(found.status, "regressed");
    assert.equal(found.machineCount, 2);
  });
});

describe("Feature: suppression, ownership and enrolment (Drizzle-Postgres)", () => {
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

  const finding = (
    overrides: Partial<RecordFindingInput> = {}
  ): RecordFindingInput => ({
    findingId: "f-1",
    ruleId: "mcp-server-unpinned",
    fingerprint: "sha256:fp-1",
    severity: "MEDIUM",
    category: null,
    layer: null,
    filePath: "/repo/.cursor/mcp.json",
    contentHash: null,
    line: null,
    column: null,
    description: "MCP server is not pinned to a version",
    evidence: null,
    owasp: [],
    cwe: null,
    confidence: null,
    fixable: null,
    suppressed: false,
    ...overrides,
  });

  it("Given an owner is assigned, when listing machines, then the person is shown", async () => {
    const { hostId } = await repository.recordReport(report());
    await repository.assignOwner({
      hostId,
      owner: "Jonathan Santilli",
      team: "Engineering",
    });

    const [summary] = await repository.listHostSummaries();
    assert.equal(summary.host.owner, "Jonathan Santilli");
    assert.equal(summary.host.team, "Engineering");
  });

  it("Given an owner is cleared, when listing, then nobody is claimed accountable", async () => {
    const { hostId } = await repository.recordReport(report());
    await repository.assignOwner({
      hostId,
      owner: "Jonathan Santilli",
      team: "Engineering",
    });
    await repository.assignOwner({ hostId, owner: null, team: null });

    const [summary] = await repository.listHostSummaries();
    assert.equal(summary.host.owner, null);
  });

  it("Given a fleet-wide suppression, when listing findings, then it is hidden everywhere", async () => {
    await repository.recordReport(
      report({ machineId: "m-a", findings: [finding()] })
    );
    await repository.recordReport(
      report({ machineId: "m-b", findings: [finding()] })
    );
    assert.equal((await repository.listFindings()).length, 1);

    await repository.suppressFinding({
      scope: "fleet",
      ruleId: "mcp-server-unpinned",
      reason: "Accepted risk for internal registry",
      createdBy: "Jonathan Santilli",
      createdAt: new Date("2026-08-22T12:00:00Z"),
    });

    assert.deepEqual(await repository.listFindings(), []);
  });

  // Silencing one laptop must not silence the fleet.
  it("Given a machine-scoped suppression, when listing, then other machines still report it", async () => {
    const a = await repository.recordReport(
      report({ machineId: "m-a", findings: [finding()] })
    );
    await repository.recordReport(
      report({ machineId: "m-b", findings: [finding()] })
    );

    await repository.suppressFinding({
      scope: "machine",
      hostId: a.hostId,
      fingerprint: "sha256:fp-1",
      reason: "Known good on the build box",
      createdBy: "Jonathan Santilli",
      createdAt: new Date("2026-08-22T12:00:00Z"),
    });

    const [found] = await repository.listFindings();
    assert.equal(found.machineCount, 1);
  });

  it("Given an expired suppression, when listing, then the finding is reported again", async () => {
    await repository.recordReport(report({ findings: [finding()] }));
    await repository.suppressFinding({
      scope: "fleet",
      ruleId: "mcp-server-unpinned",
      reason: "Temporary",
      createdBy: "Jonathan Santilli",
      createdAt: new Date("2026-08-01T12:00:00Z"),
      expiresAt: new Date("2026-08-02T12:00:00Z"),
    });

    assert.equal((await repository.listFindings()).length, 1);
  });

  it("Given a revoked suppression, when listing, then the finding returns", async () => {
    await repository.recordReport(report({ findings: [finding()] }));
    const { id } = await repository.suppressFinding({
      scope: "fleet",
      ruleId: "mcp-server-unpinned",
      reason: "Mistake",
      createdBy: "Jonathan Santilli",
      createdAt: new Date("2026-08-22T12:00:00Z"),
    });
    assert.deepEqual(await repository.listFindings(), []);

    await repository.revokeSuppression({
      id,
      revokedAt: new Date("2026-08-22T13:00:00Z"),
    });
    assert.equal((await repository.listFindings()).length, 1);
  });

  it("Given a suppression, when listing them, then its blast radius and reason are shown", async () => {
    await repository.recordReport(
      report({ machineId: "m-a", findings: [finding()] })
    );
    await repository.recordReport(
      report({ machineId: "m-b", findings: [finding()] })
    );
    await repository.suppressFinding({
      scope: "fleet",
      ruleId: "mcp-server-unpinned",
      reason: "Accepted risk for internal registry",
      createdBy: "Jonathan Santilli",
      createdAt: new Date("2026-08-22T12:00:00Z"),
    });

    const [suppression] = await repository.listSuppressions();
    assert.equal(suppression.blastRadius, 2);
    assert.equal(suppression.reason, "Accepted risk for internal registry");
    assert.equal(suppression.scope, "fleet");
  });

  it("Given a suppression naming nothing, when created, then it is refused", async () => {
    await assert.rejects(
      () =>
        repository.suppressFinding({
          scope: "fleet",
          reason: "no",
          createdBy: "x",
          createdAt: new Date(),
        }),
      /must name a fingerprint or a rule/
    );
  });

  it("Given a machine-scoped suppression with no machine, when created, then it is refused", async () => {
    await assert.rejects(
      () =>
        repository.suppressFinding({
          scope: "machine",
          ruleId: "r",
          reason: "no",
          createdBy: "x",
          createdAt: new Date(),
        }),
      /must name a machine/
    );
  });

  it("Given a capped enrolment code, when redeemed to its limit, then further use is refused", async () => {
    const now = new Date("2026-08-22T12:00:00Z");
    await repository.mintEnrolmentCode({
      code: "FLEET-7K2M-9XQ4",
      label: "Engineering rollout",
      maxUses: 2,
      createdBy: "Jonathan Santilli",
      createdAt: now,
      expiresAt: new Date("2026-08-23T12:00:00Z"),
    });

    assert.ok(
      await repository.redeemEnrolmentCode({ code: "FLEET-7K2M-9XQ4", now })
    );
    assert.ok(
      await repository.redeemEnrolmentCode({ code: "FLEET-7K2M-9XQ4", now })
    );
    assert.equal(
      await repository.redeemEnrolmentCode({ code: "FLEET-7K2M-9XQ4", now }),
      null
    );
  });

  it("Given an expired code, when redeemed, then it is refused", async () => {
    await repository.mintEnrolmentCode({
      code: "OLD-CODE",
      maxUses: 10,
      createdBy: "x",
      createdAt: new Date("2026-08-01T12:00:00Z"),
      expiresAt: new Date("2026-08-02T12:00:00Z"),
    });

    assert.equal(
      await repository.redeemEnrolmentCode({
        code: "OLD-CODE",
        now: new Date("2026-08-22T12:00:00Z"),
      }),
      null
    );
  });

  it("Given an unknown code, when redeemed, then it is refused", async () => {
    assert.equal(
      await repository.redeemEnrolmentCode({ code: "NOPE", now: new Date() }),
      null
    );
  });

  it("Given codes exist, when listing, then usability is stated for each", async () => {
    const now = new Date("2026-08-22T12:00:00Z");
    await repository.mintEnrolmentCode({
      code: "GOOD",
      maxUses: 5,
      createdBy: "x",
      createdAt: now,
      expiresAt: new Date("2026-08-23T12:00:00Z"),
    });
    await repository.mintEnrolmentCode({
      code: "STALE",
      maxUses: 5,
      createdBy: "x",
      createdAt: now,
      expiresAt: new Date("2026-08-01T12:00:00Z"),
    });

    const codes = await repository.listEnrolmentCodes(now);
    assert.equal(codes.find((c) => c.code === "GOOD")?.usable, true);
    assert.equal(codes.find((c) => c.code === "STALE")?.usable, false);
  });
});

/**
 * The numbers the console leads with.
 *
 * Every case here is one an adversarial review found wrong: each would have
 * been caught by a test in this file, and none of them was.
 */
describe("Feature: fleet aggregates (Drizzle-Postgres)", () => {
  let harness: PostgresHarness;
  let repository: DrizzleFleetRepository;

  const NOW = new Date("2026-08-22T12:00:00Z");
  const CRITICAL: RecordFindingInput = {
    findingId: "f-agg",
    ruleId: "known-malicious-content",
    fingerprint: "fp-agg",
    severity: "CRITICAL",
    category: null,
    layer: null,
    filePath: "/Users/jsantilli/.claude/skills/podcast/SKILL.md",
    contentHash: `sha256:${"a".repeat(64)}`,
    line: null,
    column: null,
    description: "Skill matches a known-bad indicator",
    evidence: null,
    owasp: [],
    cwe: null,
    confidence: null,
    fixable: null,
    suppressed: false,
  };

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

  it("Given two enrolments of the same new machine arrive together, when both are applied, then only one binds a token", async () => {
    // The existence check cannot close this on its own: both callers see no
    // row. An update-on-conflict would let the loser overwrite the winner's
    // token, locking out a machine that had just enrolled honestly.
    const [first, second] = await Promise.all([
      repository.enrolHost({
        machineId: "racing-machine",
        tokenHash: "hash-one",
        enrolledAt: NOW,
      }),
      repository.enrolHost({
        machineId: "racing-machine",
        tokenHash: "hash-two",
        enrolledAt: NOW,
      }),
    ]);

    const outcomes = [first.outcome, second.outcome].sort();
    assert.deepEqual(outcomes, ["already-enrolled", "enrolled"]);

    // Exactly one token is live, and it belongs to whoever won.
    const winner = first.outcome === "enrolled" ? "hash-one" : "hash-two";
    const loser = winner === "hash-one" ? "hash-two" : "hash-one";
    assert.ok(await repository.findHostByTokenHash(winner));
    assert.equal(await repository.findHostByTokenHash(loser), null);
  });

  it("Given a machine is already enrolled, when enrolment is attempted again, then it is refused and the original token survives", async () => {
    await repository.enrolHost({
      machineId: "settled-machine",
      tokenHash: "original",
      enrolledAt: NOW,
    });

    const second = await repository.enrolHost({
      machineId: "settled-machine",
      tokenHash: "attacker",
      enrolledAt: NOW,
    });

    assert.equal(second.outcome, "already-enrolled");
    assert.ok(await repository.findHostByTokenHash("original"));
    assert.equal(await repository.findHostByTokenHash("attacker"), null);
  });

  it("Given a revoked machine, when it tries to enrol again, then it is refused and stays revoked", async () => {
    // Revocation must not be liftable by the machine we stopped trusting.
    const { hostId } = (await repository.enrolHost({
      machineId: "revoked-machine",
      tokenHash: "before",
      enrolledAt: NOW,
    })) as { outcome: "enrolled"; hostId: string };

    await repository.revokeHost({
      hostId,
      revokedAt: NOW,
      revokedBy: "operator",
    });

    const retry = await repository.enrolHost({
      machineId: "revoked-machine",
      tokenHash: "after",
      enrolledAt: NOW,
    });

    assert.equal(retry.outcome, "already-enrolled");
    const stillRevoked =
      await repository.findHostByMachineId("revoked-machine");
    assert.ok(stillRevoked?.revokedAt);
  });

  it("Given machines report different feed versions, when reading the overview, then it names the newest version, not the last one received", async () => {
    // The old query ordered by arrival, so one machine on an ancient feed
    // reporting last made the whole fleet look stale — and blanked the
    // console with a degraded screen.
    await repository.recordReport(
      report({
        machineId: MACHINE_A,
        kbVersion: "2026.08.20.1",
        receivedAt: new Date("2026-08-22T10:00:00Z"),
      })
    );
    await repository.recordReport(
      report({
        machineId: MACHINE_B,
        hostname: "other-laptop",
        kbVersion: "2026.01.01.1",
        receivedAt: new Date("2026-08-22T11:00:00Z"),
      })
    );

    const overview = await repository.overview(NOW);

    assert.equal(overview.contentFeed.version, "2026.08.20.1");
    assert.equal(overview.contentFeed.ageDays, 2);
  });

  it("Given hourly buckets, when reading the overview, then they are true UTC instants", async () => {
    await repository.recordReport(
      report({ receivedAt: new Date("2026-08-22T02:30:00Z") })
    );

    const overview = await repository.overview(NOW);

    assert.equal(overview.checkInsPerHour.length, 1);
    assert.equal(
      overview.checkInsPerHour[0].hour.toISOString(),
      "2026-08-22T02:00:00.000Z"
    );
  });

  it("Given two machines carry byte-identical files at different paths, when grouping, then it is one variant on two machines", async () => {
    // The invariant the console exists to express: identity is the content.
    const hash = `sha256:${"c".repeat(64)}`;
    const item = (path: string) => ({
      tool: "claude-code",
      kind: "skill" as const,
      itemType: "file",
      scope: "user" as const,
      pattern: null,
      path,
      exists: true,
      contentHash: hash,
      riskSurface: [],
      resolvedAgainst: null,
    });

    await repository.recordReport(
      report({
        machineId: MACHINE_A,
        items: [item("/Users/alice/.claude/skills/podcast/SKILL.md")],
      })
    );
    await repository.recordReport(
      report({
        machineId: MACHINE_B,
        hostname: "bob-laptop",
        items: [item("/Users/bob/.claude/skills/podcast/SKILL.md")],
      })
    );

    const [group] = await repository.listArtifactGroups();

    assert.equal(group.name, "SKILL.md");
    assert.equal(group.variants.length, 1, "identical bytes are one variant");
    assert.equal(group.variants[0].machineCount, 2);
    assert.equal(group.variants[0].paths.length, 2);
  });

  it("Given one machine carries the same bytes at two paths, when reading the artifact, then it is one machine", async () => {
    const hash = `sha256:${"d".repeat(64)}`;
    const item = (path: string) => ({
      tool: "claude-code",
      kind: "skill" as const,
      itemType: "file",
      scope: "user" as const,
      pattern: null,
      path,
      exists: true,
      contentHash: hash,
      riskSurface: [],
      resolvedAgainst: null,
    });

    await repository.recordReport(
      report({
        items: [
          item("/Users/jsantilli/.claude/skills/podcast/SKILL.md"),
          item("/Users/jsantilli/work/repo/.claude/skills/podcast/SKILL.md"),
        ],
      })
    );

    const variant = await repository.findArtifactVariant(hash);

    assert.ok(variant);
    assert.equal(variant.machines.length, 1);
    assert.equal(variant.machines[0].paths.length, 2);
  });

  it("Given a fleet-wide suppression, when reading a machine and its policies, then neither still counts the finding", async () => {
    await repository.recordReport(report({ findings: [CRITICAL] }));
    const [host] = await repository.listHostSummaries();
    await repository.savePolicy({
      name: "Known-malicious content",
      ruleId: "known-malicious-content",
      severity: "CRITICAL",
      enabled: true,
      createdBy: "operator",
      now: NOW,
    });

    assert.equal(
      (await repository.findHostDetail(host.host.id))?.findings.length,
      1
    );
    assert.equal((await repository.listPolicies())[0].violatingMachines, 1);

    await repository.suppressFinding({
      scope: "fleet",
      ruleId: "known-malicious-content",
      reason: "Reviewed with the owner",
      createdBy: "operator",
      createdAt: NOW,
    });

    // A suppression that empties the queue but leaves the machine page red
    // and the policy at 0% is worse than no suppression at all.
    const detail = await repository.findHostDetail(host.host.id);
    assert.equal(detail?.findings.length, 0, "machine page");
    assert.equal(
      detail?.reports[0].findingsTotal,
      1,
      "history keeps the record"
    );
    assert.equal(
      (await repository.listPolicies())[0].violatingMachines,
      0,
      "policy"
    );
    assert.equal((await repository.listAttention()).length, 0, "queue");
  });

  it("Given a finding acknowledged on one machine, when reading the overview, then the other machine is still untriaged", async () => {
    await repository.recordReport(
      report({ machineId: MACHINE_A, findings: [CRITICAL] })
    );
    await repository.recordReport(
      report({ machineId: MACHINE_B, hostname: "other", findings: [CRITICAL] })
    );

    const hosts = await repository.listHostSummaries();
    await repository.acknowledgeFinding({
      hostId: hosts[0].host.id,
      fingerprint: "fp-agg",
      acknowledgedBy: "operator",
      acknowledgedAt: NOW,
    });

    const overview = await repository.overview(NOW);

    assert.equal(overview.untriagedFindings, 1);
  });

  it("Given a machine is revoked, when reading the overview, then it counts as neither enrolled nor reporting", async () => {
    await repository.recordReport(
      report({ machineId: MACHINE_A, findings: [CRITICAL] })
    );
    await repository.recordReport(
      report({ machineId: MACHINE_B, hostname: "other", receivedAt: NOW })
    );
    const hosts = await repository.listHostSummaries();
    const target = hosts.find((h) => h.host.machineId === MACHINE_A);

    await repository.revokeHost({
      hostId: target?.host.id ?? "",
      revokedAt: NOW,
      revokedBy: "operator",
    });

    const overview = await repository.overview(NOW);

    assert.equal(overview.hostsEnrolled, 1);
    // Its findings can never close, so they must not sit in the queue.
    assert.equal(overview.attentionTotal, 0);
    assert.equal(overview.machinesWithFindings, 0);
  });

  it("Given a machine was reimaged onto an older feed, when reading the overview, then the age reflects what it runs now", async () => {
    // Taking the max over every report ever stored made the feed age a
    // permanent high-water mark: a version reported once in February stood
    // forever, so a fleet since moved onto an old feed read as current. A
    // false all-clear on a staleness signal is worse than a false alarm.
    await repository.recordReport(
      report({
        kbVersion: "2026.08.20.1",
        receivedAt: new Date("2026-02-01T10:00:00Z"),
      })
    );
    await repository.recordReport(
      report({
        kbVersion: "2026.01.01.1",
        receivedAt: new Date("2026-08-22T10:00:00Z"),
      })
    );

    const overview = await repository.overview(NOW);

    assert.equal(overview.contentFeed.version, "2026.01.01.1");
    assert.ok((overview.contentFeed.ageDays ?? 0) > 200);
  });

  it("Given only a revoked machine ran the newest feed, when reading the overview, then it does not speak for the live fleet", async () => {
    await repository.recordReport(
      report({ machineId: MACHINE_A, kbVersion: "2026.08.20.1" })
    );
    await repository.recordReport(
      report({
        machineId: MACHINE_B,
        hostname: "other",
        kbVersion: "2026.01.01.1",
      })
    );
    const hosts = await repository.listHostSummaries();
    const stale = hosts.find((h) => h.host.machineId === MACHINE_A);
    await repository.revokeHost({
      hostId: stale?.host.id ?? "",
      revokedAt: NOW,
      revokedBy: "operator",
    });

    const overview = await repository.overview(NOW);

    assert.equal(overview.contentFeed.version, "2026.01.01.1");
  });

  it("Given identical bytes under two different filenames, when grouping, then both names survive", async () => {
    // Grouping by hash alone collapsed them into whichever name came first,
    // and the other vanished from the inventory entirely.
    const hash = `sha256:${"e".repeat(64)}`;
    const item = (path: string) => ({
      tool: "claude-code",
      kind: "config" as const,
      itemType: "file",
      scope: "user" as const,
      pattern: null,
      path,
      exists: true,
      contentHash: hash,
      riskSurface: [],
      resolvedAgainst: null,
    });

    await repository.recordReport(
      report({ machineId: MACHINE_A, items: [item("/Users/alice/CLAUDE.md")] })
    );
    await repository.recordReport(
      report({
        machineId: MACHINE_B,
        hostname: "bob",
        items: [item("/Users/bob/AGENTS.md")],
      })
    );

    const groups = await repository.listArtifactGroups();
    const names = groups.map((g) => g.name).sort();

    assert.deepEqual(names, ["AGENTS.md", "CLAUDE.md"]);
    for (const group of groups) {
      // Each row must be internally consistent: the group count and the
      // variant beneath it cannot disagree.
      assert.equal(group.machineCount, group.variants[0].machineCount);
    }
  });

  it("Given a revoked machine carries a finding, when listing findings, then it is not left open forever", async () => {
    // Its reports are refused, so the finding can never close — leaving it
    // Open means a nav badge counting something present on no machine.
    await repository.recordReport(report({ findings: [CRITICAL] }));
    const [host] = await repository.listHostSummaries();
    await repository.revokeHost({
      hostId: host.host.id,
      revokedAt: NOW,
      revokedBy: "operator",
    });

    const findings = await repository.listFindings();

    assert.equal(findings.length, 0);
  });

  it("Given a finding acknowledged on one machine, when listing attention, then only that machine says so", async () => {
    await repository.recordReport(
      report({ machineId: MACHINE_A, findings: [CRITICAL] })
    );
    await repository.recordReport(
      report({ machineId: MACHINE_B, hostname: "other", findings: [CRITICAL] })
    );
    const hosts = await repository.listHostSummaries();
    const acknowledged = hosts[0].host.id;

    await repository.acknowledgeFinding({
      hostId: acknowledged,
      fingerprint: "fp-agg",
      acknowledgedBy: "operator",
      acknowledgedAt: NOW,
    });

    const rows = await repository.listAttention();
    const taken = rows.filter((row) => row.acknowledgedBy !== null);
    const open = rows.filter((row) => row.acknowledgedBy === null);

    assert.equal(taken.length, 1);
    assert.equal(taken[0].hostId, acknowledged);
    // The other machine must still be actionable.
    assert.equal(open.length, 1);
  });

  it("Given one machine reports a finding twice, when listing suppressions, then the blast radius is one machine", async () => {
    await repository.recordReport(
      report({
        findings: [CRITICAL],
        receivedAt: new Date("2026-08-22T06:00:00Z"),
      })
    );
    await repository.recordReport(
      report({
        findings: [CRITICAL],
        receivedAt: new Date("2026-08-22T11:00:00Z"),
      })
    );

    await repository.suppressFinding({
      scope: "fleet",
      fingerprint: "fp-agg",
      reason: "Accepted risk",
      createdBy: "operator",
      createdAt: NOW,
    });

    const [suppression] = await repository.listSuppressions();

    assert.equal(suppression.blastRadius, 1);
  });
});
