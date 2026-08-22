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
