import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import type {
  ArtifactGroup,
  EnrolmentCodeSummary,
  FindingStatus,
  FleetFinding,
  FleetRepository,
  HostDetail,
  HostSummary,
  MintEnrolmentCodeInput,
  RecordedReport,
  RecordHostReportInput,
  SuppressFindingInput,
  Suppression,
} from "@/src/application/ports/fleet/fleet-repository";
import type {
  InventoryItemKind,
  InventoryScope,
} from "@/src/domain/fleet/entities/host";
import type { DrizzleDb } from "../client";
import {
  enrolmentCode,
  findingAcknowledgement,
  findingSuppression,
  host,
  hostFinding,
  hostInventoryItem,
  hostReport,
} from "../schema";

// Postgres caps a statement at 65535 bound parameters; inventory rows bind
// well under a hundred each, so chunking keeps a large machine's report from
// exceeding that in a single insert.
const ITEM_INSERT_CHUNK = 500;

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

/**
 * A finding still present in a machine's latest report is open (or
 * acknowledged). One that has vanished from every latest report is resolved:
 * the newer report is the evidence. Regression is detected on ingest, when a
 * fingerprint reappears after resolving.
 */
function resolveStatus(
  finding: { acknowledgedAt: Date | null },
  openHosts: number
): FindingStatus {
  if (openHosts === 0) {
    return "resolved";
  }
  return finding.acknowledgedAt ? "acknowledged" : "open";
}

export class DrizzleFleetRepository implements FleetRepository {
  constructor(private readonly db: DrizzleDb) {}

  async recordReport(input: RecordHostReportInput): Promise<RecordedReport> {
    return await this.db.transaction(async (tx) => {
      // A machine that has reported before keeps its row and id; only the
      // mutable description and last-seen stamp move forward.
      const [hostRow] = await tx
        .insert(host)
        .values({
          machineId: input.machineId,
          hostname: input.hostname,
          platform: input.platform,
          osRelease: input.osRelease,
          username: input.username,
          agentVersion: input.agentVersion,
          firstSeenAt: input.receivedAt,
          lastSeenAt: input.receivedAt,
        })
        .onConflictDoUpdate({
          target: host.machineId,
          set: {
            hostname: input.hostname,
            platform: input.platform,
            osRelease: input.osRelease,
            username: input.username,
            agentVersion: input.agentVersion,
            lastSeenAt: input.receivedAt,
          },
        })
        .returning({ id: host.id });

      const [reportRow] = await tx
        .insert(hostReport)
        .values({
          hostId: hostRow.id,
          receivedAt: input.receivedAt,
          collectedAt: input.collectedAt,
          kbVersion: input.kbVersion,
          itemsTotal: input.items.length,
          findingsReported: input.findings !== undefined,
          toolsDetected: input.toolsDetected ?? [],
          createdAt: input.receivedAt,
        })
        .returning({ id: hostReport.id });

      for (let i = 0; i < input.items.length; i += ITEM_INSERT_CHUNK) {
        const chunk = input.items.slice(i, i + ITEM_INSERT_CHUNK);
        await tx.insert(hostInventoryItem).values(
          chunk.map((item) => ({
            reportId: reportRow.id,
            hostId: hostRow.id,
            tool: item.tool,
            kind: item.kind,
            itemType: item.itemType,
            scope: item.scope,
            pattern: item.pattern,
            path: item.path,
            exists: item.exists,
            contentHash: item.contentHash,
            riskSurface: item.riskSurface ?? [],
            resolvedAgainst: item.resolvedAgainst,
          }))
        );
      }

      for (
        let i = 0;
        i < (input.findings?.length ?? 0);
        i += ITEM_INSERT_CHUNK
      ) {
        const chunk = (input.findings ?? []).slice(i, i + ITEM_INSERT_CHUNK);
        await tx.insert(hostFinding).values(
          chunk.map((finding) => ({
            reportId: reportRow.id,
            hostId: hostRow.id,
            findingId: finding.findingId,
            ruleId: finding.ruleId,
            fingerprint: finding.fingerprint,
            severity: finding.severity as "CRITICAL",
            category: finding.category,
            layer: finding.layer,
            filePath: finding.filePath,
            contentHash: finding.contentHash,
            line: finding.line,
            column: finding.column,
            description: finding.description,
            evidence: finding.evidence,
            owasp: finding.owasp ?? [],
            cwe: finding.cwe,
            confidence: finding.confidence,
            fixable: finding.fixable,
            suppressed: finding.suppressed,
          }))
        );
      }

      return { hostId: hostRow.id, reportId: reportRow.id };
    });
  }

  async listHostSummaries(): Promise<HostSummary[]> {
    const hosts = await this.db
      .select()
      .from(host)
      .orderBy(desc(host.lastSeenAt));

    if (hosts.length === 0) {
      return [];
    }

    // The newest report per host, chosen by receipt time so a machine with a
    // skewed clock cannot pin an old report as current.
    const latestReports = await this.db
      .selectDistinctOn([hostReport.hostId], {
        id: hostReport.id,
        hostId: hostReport.hostId,
        collectedAt: hostReport.collectedAt,
        itemsTotal: hostReport.itemsTotal,
      })
      .from(hostReport)
      .where(
        inArray(
          hostReport.hostId,
          hosts.map((h) => h.id)
        )
      )
      .orderBy(hostReport.hostId, desc(hostReport.receivedAt));

    const reportByHostId = new Map(latestReports.map((r) => [r.hostId, r]));
    const reportIds = latestReports.map((r) => r.id);

    const breakdown = reportIds.length
      ? await this.db
          .select({
            reportId: hostInventoryItem.reportId,
            kind: hostInventoryItem.kind,
            tool: hostInventoryItem.tool,
            count: sql<number>`cast(count(*) as int)`,
          })
          .from(hostInventoryItem)
          .where(
            and(
              inArray(hostInventoryItem.reportId, reportIds),
              eq(hostInventoryItem.exists, true)
            )
          )
          .groupBy(
            hostInventoryItem.reportId,
            hostInventoryItem.kind,
            hostInventoryItem.tool
          )
      : [];

    const statsByReportId = new Map<
      string,
      { skills: number; configs: number; tools: Set<string> }
    >();

    for (const row of breakdown) {
      const stats = statsByReportId.get(row.reportId) ?? {
        skills: 0,
        configs: 0,
        tools: new Set<string>(),
      };
      if (row.kind === "skill") {
        stats.skills += row.count;
      } else {
        stats.configs += row.count;
      }
      stats.tools.add(row.tool);
      statsByReportId.set(row.reportId, stats);
    }

    return hosts.map((hostRow) => {
      const report = reportByHostId.get(hostRow.id);
      const stats = report ? statsByReportId.get(report.id) : undefined;

      return {
        host: hostRow,
        lastReportId: report?.id ?? null,
        lastCollectedAt: report?.collectedAt ?? null,
        itemsTotal: (stats?.skills ?? 0) + (stats?.configs ?? 0),
        skillsTotal: stats?.skills ?? 0,
        configsTotal: stats?.configs ?? 0,
        toolNames: [...(stats?.tools ?? [])].sort(),
      };
    });
  }

  async findHostDetail(hostId: string): Promise<HostDetail | null> {
    const [hostRow] = await this.db
      .select()
      .from(host)
      .where(eq(host.id, hostId))
      .limit(1);

    if (!hostRow) {
      return null;
    }

    const [report] = await this.db
      .select()
      .from(hostReport)
      .where(eq(hostReport.hostId, hostId))
      .orderBy(desc(hostReport.receivedAt))
      .limit(1);

    if (!report) {
      return {
        host: hostRow,
        lastCollectedAt: null,
        kbVersion: null,
        items: [],
      };
    }

    const items = await this.db
      .select()
      .from(hostInventoryItem)
      .where(eq(hostInventoryItem.reportId, report.id))
      .orderBy(hostInventoryItem.tool, hostInventoryItem.path);

    return {
      host: hostRow,
      lastCollectedAt: report.collectedAt,
      kbVersion: report.kbVersion,
      items: items.map((item) => ({
        tool: item.tool,
        kind: item.kind as InventoryItemKind,
        itemType: item.itemType,
        scope: item.scope as InventoryScope,
        path: item.path,
        exists: item.exists,
        contentHash: item.contentHash,
        riskSurface: toStringArray(item.riskSurface),
      })),
    };
  }
  /**
   * Fleet-wide artifacts keyed by content hash.
   *
   * Two files sharing a name but differing by one byte are two variants, and
   * only the latest report from each machine counts — an artifact removed
   * yesterday must not still appear today. Items with no hash (absent files,
   * or an agent predating hashing) are excluded: they cannot be identified.
   */
  async listArtifactGroups(): Promise<ArtifactGroup[]> {
    const latest = this.db
      .selectDistinctOn([hostReport.hostId], {
        id: hostReport.id,
      })
      .from(hostReport)
      .orderBy(hostReport.hostId, desc(hostReport.receivedAt))
      .as("latest");

    const rows = await this.db
      .select({
        tool: hostInventoryItem.tool,
        kind: hostInventoryItem.kind,
        path: hostInventoryItem.path,
        contentHash: hostInventoryItem.contentHash,
        machineCount: sql<number>`cast(count(distinct ${hostInventoryItem.hostId}) as int)`,
        firstSeenAt: sql<Date>`min(${hostReport.collectedAt})`,
      })
      .from(hostInventoryItem)
      .innerJoin(latest, eq(hostInventoryItem.reportId, latest.id))
      .innerJoin(hostReport, eq(hostInventoryItem.reportId, hostReport.id))
      .where(
        and(
          eq(hostInventoryItem.exists, true),
          isNotNull(hostInventoryItem.contentHash)
        )
      )
      .groupBy(
        hostInventoryItem.tool,
        hostInventoryItem.kind,
        hostInventoryItem.path,
        hostInventoryItem.contentHash
      );

    // Group by the artifact's display name, but keep each hash separate
    // inside it — the name is a label, the hash is the identity.
    const groups = new Map<string, ArtifactGroup>();

    for (const row of rows) {
      const name = row.path.split("/").pop() || row.path;
      const key = `${row.tool}::${row.kind}::${name}`;
      const group = groups.get(key) ?? {
        name,
        tool: row.tool,
        kind: row.kind as InventoryItemKind,
        variants: [],
        machineCount: 0,
      };

      group.variants.push({
        contentHash: row.contentHash as string,
        machineCount: row.machineCount,
        firstSeenAt: new Date(row.firstSeenAt),
        paths: [row.path],
      });
      group.machineCount += row.machineCount;
      groups.set(key, group);
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        variants: group.variants.sort(
          (a, b) => b.machineCount - a.machineCount
        ),
      }))
      .sort((a, b) => b.machineCount - a.machineCount);
  }
  /**
   * Findings across the fleet, with status derived from report history.
   *
   * A finding is OPEN while the machine's latest report still contains it,
   * and RESOLVED once a later report does not — the absence in a newer report
   * is the only evidence of a fix this server can ever have. REGRESSED marks
   * one that came back after resolving. ACKNOWLEDGED is the single mutable
   * bit: a person taking responsibility, which does not close anything.
   */
  async listFindings(): Promise<FleetFinding[]> {
    // Only a report that carried findings can be evidence that one is gone.
    const latest = this.db
      .selectDistinctOn([hostReport.hostId], {
        id: hostReport.id,
        hostId: hostReport.hostId,
      })
      .from(hostReport)
      .where(eq(hostReport.findingsReported, true))
      .orderBy(hostReport.hostId, desc(hostReport.receivedAt))
      .as("latest");

    const rows = await this.db
      .select({
        fingerprint: hostFinding.fingerprint,
        hostId: hostFinding.hostId,
        ruleId: hostFinding.ruleId,
        severity: hostFinding.severity,
        description: hostFinding.description,
        filePath: hostFinding.filePath,
        contentHash: hostFinding.contentHash,
        reportId: hostFinding.reportId,
        collectedAt: hostReport.collectedAt,
        isLatest: sql<boolean>`(${hostFinding.reportId} = ${latest.id})`,
      })
      .from(hostFinding)
      .innerJoin(hostReport, eq(hostFinding.reportId, hostReport.id))
      .leftJoin(latest, eq(hostFinding.hostId, latest.hostId))
      .where(eq(hostFinding.suppressed, false));

    // A live suppression hides a finding from the queue. Expired and revoked
    // ones do not: silence has to be renewed deliberately, not by default.
    const suppressions = await this.db
      .select()
      .from(findingSuppression)
      .where(isNull(findingSuppression.revokedAt));

    const now = new Date();
    const live = suppressions.filter(
      (sup) => sup.expiresAt === null || sup.expiresAt > now
    );
    const isSuppressed = (row: {
      fingerprint: string;
      ruleId: string;
      hostId: string;
    }) =>
      live.some(
        (sup) =>
          (sup.fingerprint === null || sup.fingerprint === row.fingerprint) &&
          (sup.ruleId === null || sup.ruleId === row.ruleId) &&
          (sup.hostId === null || sup.hostId === row.hostId)
      );

    const acks = await this.db.select().from(findingAcknowledgement);
    const ackByKey = new Map(
      acks.map((a) => [`${a.hostId}::${a.fingerprint}`, a])
    );

    type Accumulator = {
      finding: FleetFinding;
      openHosts: Set<string>;
      seenHosts: Set<string>;
    };
    const byFingerprint = new Map<string, Accumulator>();

    for (const row of rows) {
      if (isSuppressed(row)) {
        continue;
      }
      const entry = byFingerprint.get(row.fingerprint) ?? {
        finding: {
          fingerprint: row.fingerprint,
          ruleId: row.ruleId,
          severity: row.severity,
          description: row.description,
          filePath: row.filePath,
          contentHash: row.contentHash,
          status: "resolved" as FindingStatus,
          machineCount: 0,
          firstSeenAt: row.collectedAt,
          lastSeenAt: row.collectedAt,
          acknowledgedBy: null,
          acknowledgedAt: null,
        },
        openHosts: new Set<string>(),
        seenHosts: new Set<string>(),
      };

      entry.seenHosts.add(row.hostId);
      if (row.isLatest) {
        entry.openHosts.add(row.hostId);
      }
      if (row.collectedAt < entry.finding.firstSeenAt) {
        entry.finding.firstSeenAt = row.collectedAt;
      }
      if (row.collectedAt > entry.finding.lastSeenAt) {
        entry.finding.lastSeenAt = row.collectedAt;
      }

      const ack = ackByKey.get(`${row.hostId}::${row.fingerprint}`);
      if (ack) {
        entry.finding.acknowledgedBy = ack.acknowledgedBy;
        entry.finding.acknowledgedAt = ack.acknowledgedAt;
      }

      byFingerprint.set(row.fingerprint, entry);
    }

    return [...byFingerprint.values()]
      .map(({ finding, openHosts }) => ({
        ...finding,
        machineCount: openHosts.size,
        status: resolveStatus(finding, openHosts.size),
      }))
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }

  async acknowledgeFinding(input: {
    hostId: string;
    fingerprint: string;
    acknowledgedBy: string;
    acknowledgedAt: Date;
    note?: string;
  }): Promise<void> {
    await this.db
      .insert(findingAcknowledgement)
      .values({
        hostId: input.hostId,
        fingerprint: input.fingerprint,
        acknowledgedBy: input.acknowledgedBy,
        acknowledgedAt: input.acknowledgedAt,
        note: input.note ?? null,
      })
      .onConflictDoUpdate({
        target: [
          findingAcknowledgement.hostId,
          findingAcknowledgement.fingerprint,
        ],
        set: {
          acknowledgedBy: input.acknowledgedBy,
          acknowledgedAt: input.acknowledgedAt,
          note: input.note ?? null,
        },
      });
  }
  async assignOwner(input: {
    hostId: string;
    owner: string | null;
    team: string | null;
  }): Promise<void> {
    await this.db
      .update(host)
      .set({ owner: input.owner, team: input.team })
      .where(eq(host.id, input.hostId));
  }

  async suppressFinding(input: SuppressFindingInput): Promise<{ id: string }> {
    if (!(input.fingerprint || input.ruleId)) {
      throw new Error("A suppression must name a fingerprint or a rule.");
    }
    if (input.scope === "machine" && !input.hostId) {
      throw new Error("A machine-scoped suppression must name a machine.");
    }

    const [row] = await this.db
      .insert(findingSuppression)
      .values({
        scope: input.scope,
        hostId: input.scope === "machine" ? (input.hostId ?? null) : null,
        fingerprint: input.fingerprint ?? null,
        ruleId: input.ruleId ?? null,
        reason: input.reason,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt ?? null,
      })
      .returning({ id: findingSuppression.id });

    return { id: row.id };
  }

  /**
   * Live suppressions with the number of currently-reported findings each one
   * silences. Blast radius is the number an operator most needs before
   * agreeing to hide something, so it is computed here rather than guessed.
   */
  async listSuppressions(): Promise<Suppression[]> {
    const rows = await this.db
      .select()
      .from(findingSuppression)
      .where(isNull(findingSuppression.revokedAt))
      .orderBy(desc(findingSuppression.createdAt));

    const counts = await this.db
      .select({
        fingerprint: hostFinding.fingerprint,
        ruleId: hostFinding.ruleId,
        hostId: hostFinding.hostId,
        total: sql<number>`cast(count(*) as int)`,
      })
      .from(hostFinding)
      .groupBy(hostFinding.fingerprint, hostFinding.ruleId, hostFinding.hostId);

    return rows.map((row) => ({
      id: row.id,
      scope: row.scope,
      hostId: row.hostId,
      fingerprint: row.fingerprint,
      ruleId: row.ruleId,
      reason: row.reason,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      blastRadius: counts
        .filter(
          (c) =>
            (row.fingerprint ? c.fingerprint === row.fingerprint : true) &&
            (row.ruleId ? c.ruleId === row.ruleId : true) &&
            (row.hostId ? c.hostId === row.hostId : true)
        )
        .reduce((sum, c) => sum + c.total, 0),
    }));
  }

  async revokeSuppression(input: {
    id: string;
    revokedAt: Date;
  }): Promise<void> {
    await this.db
      .update(findingSuppression)
      .set({ revokedAt: input.revokedAt })
      .where(eq(findingSuppression.id, input.id));
  }

  async mintEnrolmentCode(
    input: MintEnrolmentCodeInput
  ): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(enrolmentCode)
      .values({
        code: input.code,
        label: input.label ?? null,
        maxUses: input.maxUses,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
      })
      .returning({ id: enrolmentCode.id });

    return { id: row.id };
  }

  async listEnrolmentCodes(now: Date): Promise<EnrolmentCodeSummary[]> {
    const rows = await this.db
      .select()
      .from(enrolmentCode)
      .orderBy(desc(enrolmentCode.createdAt));

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      label: row.label,
      maxUses: row.maxUses,
      usedCount: row.usedCount,
      createdBy: row.createdBy,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      usable:
        row.revokedAt === null &&
        row.expiresAt > now &&
        row.usedCount < row.maxUses,
    }));
  }

  /**
   * Spends one use, atomically. The conditions live in the UPDATE rather than
   * in a read-then-write so two machines enrolling at once cannot both take
   * the last use of a capped code.
   */
  async redeemEnrolmentCode(input: {
    code: string;
    now: Date;
  }): Promise<{ id: string } | null> {
    const [row] = await this.db
      .update(enrolmentCode)
      .set({ usedCount: sql`${enrolmentCode.usedCount} + 1` })
      .where(
        and(
          eq(enrolmentCode.code, input.code),
          isNull(enrolmentCode.revokedAt),
          gt(enrolmentCode.expiresAt, input.now),
          sql`${enrolmentCode.usedCount} < ${enrolmentCode.maxUses}`
        )
      )
      .returning({ id: enrolmentCode.id });

    return row ? { id: row.id } : null;
  }
}
