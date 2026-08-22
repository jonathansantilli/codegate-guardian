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
  ActivityRecord,
  ArtifactGroup,
  ArtifactVariant,
  ArtifactVariantDetail,
  AttentionRow,
  EnrolmentCodeSummary,
  FindingStatus,
  FleetFinding,
  FleetOverview,
  FleetRepository,
  HostDetail,
  HostFindingRow,
  HostReportSummary,
  HostSummary,
  MintEnrolmentCodeInput,
  PolicyRecord,
  RecordActivityInput,
  RecordedReport,
  RecordHostReportInput,
  SavePolicyInput,
  SuppressFindingInput,
  Suppression,
} from "@/src/application/ports/fleet/fleet-repository";
import type {
  InventoryItemKind,
  InventoryScope,
} from "@/src/domain/fleet/entities/host";
import type { DrizzleDb } from "../client";
import {
  activityEvent,
  enrolmentCode,
  findingAcknowledgement,
  findingSuppression,
  host,
  hostFinding,
  hostInventoryItem,
  hostReport,
  policy,
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

/** Worst first. An unknown severity sorts last rather than first. */
function severityRank(severity: string): number {
  return SEVERITY_ORDER[severity.toUpperCase()] ?? Number.MAX_SAFE_INTEGER;
}

/** Reports kept on a machine's history panel. */
const REPORT_HISTORY_LIMIT = 20;

/** Rows the attention queue returns before the caller asks for more. */
const ATTENTION_LIMIT = 50;

/** Rejected check-ins listed on the overview. */
const REJECTION_LIMIT = 20;

const HOUR_MS = 60 * 60 * 1000;

/** How far back the overview's check-in chart reaches. */
const CHECK_IN_WINDOW_HOURS = 24;

/**
 * A machine counts as reporting if it has been heard from inside this window.
 * The agent reports every six hours, so a full day of silence is a machine
 * that has stopped, not one that is merely between reports.
 */
const REPORTING_WINDOW_MS = 24 * HOUR_MS;

/** Written by the ingest endpoint when a check-in is turned away. */
const CHECK_IN_REJECTED = "Check-in rejected";

const DAY_MS = 24 * HOUR_MS;

/**
 * How old the content feed is, read from the version string the agents report.
 *
 * Feed versions are dated — 2026.08.20.1 — so the version is also the release
 * date. A string that does not parse yields a null age rather than a wrong
 * one: better to say nothing than to claim a feed is current.
 */
function contentFeedAge(
  version: string | null,
  now: Date
): { version: string | null; ageDays: number | null } {
  if (!version) {
    return { version: null, ageDays: null };
  }

  const dated = version.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (!dated) {
    return { version, ageDays: null };
  }

  const released = Date.UTC(
    Number(dated[1]),
    Number(dated[2]) - 1,
    Number(dated[3])
  );
  return {
    version,
    ageDays: Math.max(0, Math.floor((now.getTime() - released) / DAY_MS)),
  };
}

/**
 * Whether a live suppression covers this finding.
 *
 * A null field on a suppression means "any": a fleet-wide suppression has no
 * host, and a rule-wide one has no fingerprint.
 */
function isSuppressedBy(
  live: {
    fingerprint: string | null;
    ruleId: string | null;
    hostId: string | null;
  }[],
  row: { fingerprint: string; ruleId: string; hostId: string }
): boolean {
  return live.some(
    (sup) =>
      (sup.fingerprint === null || sup.fingerprint === row.fingerprint) &&
      (sup.ruleId === null || sup.ruleId === row.ruleId) &&
      (sup.hostId === null || sup.hostId === row.hostId)
  );
}

/**
 * A finding still present in a machine's latest report is open (or
 * acknowledged). One that has vanished from every latest report is resolved:
 * the newer report is the evidence. Regression is detected on ingest, when a
 * fingerprint reappears after resolving.
 */
/**
 * Whether a finding disappeared and came back on any machine.
 *
 * Looks for a report between the finding's first appearance and its last that
 * did not carry it. A finding merely reported twice in a row has no gap; one
 * that was fixed and returned does.
 */
function hasGap(
  carriedByHost: Map<string, Set<string>>,
  allReportsByHost: Map<string, string[]>
): boolean {
  for (const [hostId, carried] of carriedByHost) {
    const sequence = allReportsByHost.get(hostId) ?? [];
    const first = sequence.findIndex((id) => carried.has(id));
    const last = sequence.findLastIndex((id) => carried.has(id));
    if (first === -1 || last <= first) {
      continue;
    }
    for (let i = first + 1; i < last; i++) {
      if (!carried.has(sequence[i])) {
        return true;
      }
    }
  }
  return false;
}

function resolveStatus(
  finding: { acknowledgedAt: Date | null },
  openHosts: number,
  regressed: boolean
): FindingStatus {
  if (openHosts === 0) {
    return "resolved";
  }
  // A finding that came back outranks an acknowledgement made before it did.
  if (regressed) {
    return "regressed";
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
        findings: [],
        reports: [],
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
      findings: await this.findingsOnHost(hostId),
      reports: await this.reportHistory(hostId),
    };
  }

  /**
   * The findings the machine's newest findings-bearing report carried.
   *
   * Deliberately not the newest report: an inventory-only check-in asserts
   * nothing about findings, and reading it as "clean" would empty this list
   * every time the agent ran without a scan.
   */
  private async findingsOnHost(hostId: string): Promise<HostFindingRow[]> {
    const [withFindings] = await this.db
      .select({ id: hostReport.id })
      .from(hostReport)
      .where(
        and(
          eq(hostReport.hostId, hostId),
          eq(hostReport.findingsReported, true)
        )
      )
      .orderBy(desc(hostReport.receivedAt))
      .limit(1);

    if (!withFindings) {
      return [];
    }

    const rows = await this.db
      .select({
        fingerprint: hostFinding.fingerprint,
        ruleId: hostFinding.ruleId,
        severity: hostFinding.severity,
        description: hostFinding.description,
        filePath: hostFinding.filePath,
        contentHash: hostFinding.contentHash,
        evidence: hostFinding.evidence,
        line: hostFinding.line,
        column: hostFinding.column,
      })
      .from(hostFinding)
      .where(
        and(
          eq(hostFinding.reportId, withFindings.id),
          eq(hostFinding.suppressed, false)
        )
      );

    return rows.sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity)
    );
  }

  /** What the machine has sent, newest first, with what each report carried. */
  private async reportHistory(
    hostId: string,
    limit = REPORT_HISTORY_LIMIT
  ): Promise<HostReportSummary[]> {
    const reports = await this.db
      .select({
        id: hostReport.id,
        collectedAt: hostReport.collectedAt,
        receivedAt: hostReport.receivedAt,
        itemsTotal: hostReport.itemsTotal,
        findingsReported: hostReport.findingsReported,
      })
      .from(hostReport)
      .where(eq(hostReport.hostId, hostId))
      .orderBy(desc(hostReport.receivedAt))
      .limit(limit);

    if (reports.length === 0) {
      return [];
    }

    const counts = await this.db
      .select({
        reportId: hostFinding.reportId,
        total: sql<number>`count(*)::int`,
        critical: sql<number>`count(*) filter (where ${hostFinding.severity} = 'CRITICAL')::int`,
      })
      .from(hostFinding)
      .where(
        inArray(
          hostFinding.reportId,
          reports.map((r) => r.id)
        )
      )
      .groupBy(hostFinding.reportId);

    const byReport = new Map(counts.map((c) => [c.reportId, c]));

    return reports.map((report) => ({
      ...report,
      findingsTotal: byReport.get(report.id)?.total ?? 0,
      criticalTotal: byReport.get(report.id)?.critical ?? 0,
    }));
  }

  /**
   * Machines and the people accountable for them, worst first.
   *
   * One row per finding per machine rather than one per finding: two laptops
   * carrying the same malicious skill are two conversations with two people,
   * and collapsing them hides the second.
   */
  async listAttention(limit = ATTENTION_LIMIT): Promise<AttentionRow[]> {
    const latest = this.db
      .selectDistinctOn([hostReport.hostId], {
        id: hostReport.id,
        hostId: hostReport.hostId,
        collectedAt: hostReport.collectedAt,
      })
      .from(hostReport)
      .where(eq(hostReport.findingsReported, true))
      .orderBy(hostReport.hostId, desc(hostReport.receivedAt))
      .as("latest");

    const rows = await this.db
      .select({
        hostId: host.id,
        hostname: host.hostname,
        owner: host.owner,
        team: host.team,
        fingerprint: hostFinding.fingerprint,
        ruleId: hostFinding.ruleId,
        severity: hostFinding.severity,
        description: hostFinding.description,
        filePath: hostFinding.filePath,
        lastSeenAt: latest.collectedAt,
      })
      .from(hostFinding)
      .innerJoin(latest, eq(hostFinding.reportId, latest.id))
      .innerJoin(host, eq(hostFinding.hostId, host.id))
      .where(eq(hostFinding.suppressed, false));

    const live = await this.liveSuppressions();
    const visible = rows.filter((row) => !isSuppressedBy(live, row));

    return visible
      .sort(
        (a, b) =>
          severityRank(a.severity) - severityRank(b.severity) ||
          b.lastSeenAt.getTime() - a.lastSeenAt.getTime()
      )
      .slice(0, limit);
  }

  /** Suppressions that are actually in force right now. */
  private async liveSuppressions() {
    const rows = await this.db
      .select()
      .from(findingSuppression)
      .where(isNull(findingSuppression.revokedAt));

    const now = new Date();
    return rows.filter((sup) => sup.expiresAt === null || sup.expiresAt > now);
  }

  /**
   * The overview's headline numbers.
   *
   * Counted here rather than in the browser so the page states one set of
   * numbers, and so a fleet of thousands does not have to be shipped to a
   * laptop to be counted.
   */
  async overview(now: Date): Promise<FleetOverview> {
    const hosts = await this.db.select().from(host);
    const attention = await this.listAttention(Number.MAX_SAFE_INTEGER);

    const reportingSince = new Date(now.getTime() - REPORTING_WINDOW_MS);
    const dayStart = new Date(now.getTime() - CHECK_IN_WINDOW_HOURS * HOUR_MS);

    const perHour = await this.db
      .select({
        hour: sql<Date>`date_trunc('hour', ${hostReport.receivedAt})`,
        count: sql<number>`count(*)::int`,
      })
      .from(hostReport)
      .where(gt(hostReport.receivedAt, dayStart))
      .groupBy(sql`date_trunc('hour', ${hostReport.receivedAt})`)
      .orderBy(sql`date_trunc('hour', ${hostReport.receivedAt})`);

    const rejections = await this.db
      .select({
        hostname: activityEvent.actorName,
        reason: activityEvent.result,
        at: activityEvent.occurredAt,
      })
      .from(activityEvent)
      .where(
        and(
          eq(activityEvent.action, CHECK_IN_REJECTED),
          gt(activityEvent.occurredAt, new Date(now.getTime() - HOUR_MS))
        )
      )
      .orderBy(desc(activityEvent.occurredAt))
      .limit(REJECTION_LIMIT);

    const ownerByHostname = new Map(hosts.map((h) => [h.hostname, h.owner]));
    const acknowledged = await this.acknowledgedFingerprints();

    const [newest] = await this.db
      .select({ kbVersion: hostReport.kbVersion })
      .from(hostReport)
      .where(isNotNull(hostReport.kbVersion))
      .orderBy(desc(hostReport.receivedAt))
      .limit(1);
    const newestKbVersion = newest?.kbVersion ?? null;

    const [newestReport] = await this.db
      .select({ receivedAt: hostReport.receivedAt })
      .from(hostReport)
      .orderBy(desc(hostReport.receivedAt))
      .limit(1);

    return {
      hostsEnrolled: hosts.length,
      hostsReporting: hosts.filter((h) => h.lastSeenAt > reportingSince).length,
      ownersWithOpenFindings: new Set(
        attention.map((row) => row.owner ?? row.hostname)
      ).size,
      teamsWithOpenFindings: new Set(
        attention.map((row) => row.team ?? "Unassigned")
      ).size,
      openFindings: attention.length,
      untriagedFindings: attention.filter(
        (row) => !acknowledged.has(row.fingerprint)
      ).length,
      checkInsPerHour: perHour.map((row) => ({
        hour: new Date(row.hour),
        count: row.count,
      })),
      // The hour buckets above are for the chart; "last check-in" has to be
      // the real arrival time, not the start of the hour it landed in.
      lastCheckInAt: newestReport?.receivedAt ?? null,
      rejections: rejections.map((row) => ({
        hostname: row.hostname,
        owner: ownerByHostname.get(row.hostname) ?? null,
        reason: row.reason,
        at: row.at,
      })),
      contentFeed: contentFeedAge(newestKbVersion, now),
    };
  }

  private async acknowledgedFingerprints(): Promise<Set<string>> {
    const rows = await this.db
      .select({ fingerprint: findingAcknowledgement.fingerprint })
      .from(findingAcknowledgement);
    return new Set(rows.map((row) => row.fingerprint));
  }
  /**
   * Fleet-wide artifacts keyed by content hash.
   *
   * Two files sharing a name but differing by one byte are two variants, and
   * only the latest report from each machine counts — an artifact removed
   * yesterday must not still appear today. Items with no hash (absent files,
   * or an agent predating hashing) are excluded: they cannot be identified.
   */
  /**
   * One content hash and every machine carrying it.
   *
   * Only each machine's latest report counts: a file deleted yesterday is not
   * something anyone still carries, and listing it would send an operator to
   * a laptop that has already been fixed.
   */
  async findArtifactVariant(
    contentHash: string
  ): Promise<ArtifactVariantDetail | null> {
    const latest = this.db
      .selectDistinctOn([hostReport.hostId], { id: hostReport.id })
      .from(hostReport)
      .orderBy(hostReport.hostId, desc(hostReport.receivedAt))
      .as("latest");

    const rows = await this.db
      .select({
        hostId: host.id,
        hostname: host.hostname,
        owner: host.owner,
        team: host.team,
        lastSeenAt: host.lastSeenAt,
        path: hostInventoryItem.path,
        tool: hostInventoryItem.tool,
        kind: hostInventoryItem.kind,
        collectedAt: hostReport.collectedAt,
      })
      .from(hostInventoryItem)
      .innerJoin(latest, eq(hostInventoryItem.reportId, latest.id))
      .innerJoin(hostReport, eq(hostInventoryItem.reportId, hostReport.id))
      .innerJoin(host, eq(hostInventoryItem.hostId, host.id))
      .where(
        and(
          eq(hostInventoryItem.contentHash, contentHash),
          eq(hostInventoryItem.exists, true)
        )
      );

    if (rows.length === 0) {
      return null;
    }

    const name = rows[0].path.split("/").pop() || rows[0].path;

    // Every other distinct file sharing this name — the variant next to it is
    // usually the one it is being mistaken for.
    const siblingRows = await this.db
      .select({
        contentHash: hostInventoryItem.contentHash,
        path: hostInventoryItem.path,
        machineCount: sql<number>`cast(count(distinct ${hostInventoryItem.hostId}) as int)`,
        firstSeenAt: sql<Date>`min(${hostReport.collectedAt})`,
      })
      .from(hostInventoryItem)
      .innerJoin(latest, eq(hostInventoryItem.reportId, latest.id))
      .innerJoin(hostReport, eq(hostInventoryItem.reportId, hostReport.id))
      .where(
        and(
          eq(hostInventoryItem.tool, rows[0].tool),
          eq(hostInventoryItem.exists, true),
          isNotNull(hostInventoryItem.contentHash),
          sql`regexp_replace(${hostInventoryItem.path}, '^.*/', '') = ${name}`
        )
      )
      .groupBy(hostInventoryItem.contentHash, hostInventoryItem.path);

    const siblings: ArtifactVariant[] = siblingRows
      .filter((row) => row.contentHash !== contentHash)
      .map((row) => ({
        contentHash: row.contentHash as string,
        machineCount: row.machineCount,
        firstSeenAt: new Date(row.firstSeenAt),
        paths: [row.path],
      }));

    return {
      contentHash,
      name,
      tool: rows[0].tool,
      kind: rows[0].kind as InventoryItemKind,
      firstSeenAt: new Date(
        Math.min(...rows.map((row) => row.collectedAt.getTime()))
      ),
      machines: rows.map((row) => ({
        hostId: row.hostId,
        hostname: row.hostname,
        owner: row.owner,
        team: row.team,
        path: row.path,
        lastSeenAt: row.lastSeenAt,
      })),
      siblings,
    };
  }

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
      groups.set(key, group);
    }

    // A machine carrying three variants of one name is still one machine.
    // Summing the variant counts would treat it as three, which overstates
    // spread on exactly the rows an operator is most likely to act on.
    const perName = await this.db
      .select({
        tool: hostInventoryItem.tool,
        kind: hostInventoryItem.kind,
        name: sql<string>`regexp_replace(${hostInventoryItem.path}, '^.*/', '')`,
        machineCount: sql<number>`cast(count(distinct ${hostInventoryItem.hostId}) as int)`,
      })
      .from(hostInventoryItem)
      .innerJoin(latest, eq(hostInventoryItem.reportId, latest.id))
      .where(
        and(
          eq(hostInventoryItem.exists, true),
          isNotNull(hostInventoryItem.contentHash)
        )
      )
      .groupBy(
        hostInventoryItem.tool,
        hostInventoryItem.kind,
        sql`regexp_replace(${hostInventoryItem.path}, '^.*/', '')`
      );

    for (const row of perName) {
      const group = groups.get(`${row.tool}::${row.kind}::${row.name}`);
      if (group) {
        group.machineCount = row.machineCount;
      }
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
        evidence: hostFinding.evidence,
        line: hostFinding.line,
        column: hostFinding.column,
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

    // The ordered sequence of findings-carrying reports per machine. A finding
    // that is present, then absent, then present again has regressed — and
    // that is only visible against the sequence, not against the latest report.
    const sequence = await this.db
      .select({ id: hostReport.id, hostId: hostReport.hostId })
      .from(hostReport)
      .where(eq(hostReport.findingsReported, true))
      .orderBy(hostReport.hostId, hostReport.receivedAt);

    const reportsByHost = new Map<string, string[]>();
    for (const row of sequence) {
      reportsByHost.set(row.hostId, [
        ...(reportsByHost.get(row.hostId) ?? []),
        row.id,
      ]);
    }

    const acks = await this.db.select().from(findingAcknowledgement);
    const ackByKey = new Map(
      acks.map((a) => [`${a.hostId}::${a.fingerprint}`, a])
    );

    type Accumulator = {
      finding: FleetFinding;
      openHosts: Set<string>;
      seenHosts: Set<string>;
      /** Reports that carried this finding, per machine. */
      reportsByHost: Map<string, Set<string>>;
    };
    const byFingerprint = new Map<string, Accumulator>();

    for (const row of rows) {
      if (isSuppressedBy(live, row)) {
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
          evidence: row.evidence,
          line: row.line,
          column: row.column,
        },
        openHosts: new Set<string>(),
        seenHosts: new Set<string>(),
        reportsByHost: new Map<string, Set<string>>(),
      };

      entry.seenHosts.add(row.hostId);
      entry.reportsByHost.set(
        row.hostId,
        (entry.reportsByHost.get(row.hostId) ?? new Set<string>()).add(
          row.reportId
        )
      );
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
      .map(({ finding, openHosts, reportsByHost: carried }) => ({
        ...finding,
        machineCount: openHosts.size,
        status: resolveStatus(
          finding,
          openHosts.size,
          hasGap(carried, reportsByHost)
        ),
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
  async recordActivity(input: RecordActivityInput): Promise<void> {
    await this.db.insert(activityEvent).values(input);
  }

  async listActivity(limit = 100): Promise<ActivityRecord[]> {
    return await this.db
      .select()
      .from(activityEvent)
      .orderBy(desc(activityEvent.occurredAt))
      .limit(limit);
  }

  async savePolicy(input: SavePolicyInput): Promise<{ id: string }> {
    if (input.id) {
      const [row] = await this.db
        .update(policy)
        .set({
          name: input.name,
          description: input.description ?? null,
          ruleId: input.ruleId,
          severity: input.severity as "CRITICAL",
          enabled: input.enabled,
          version: sql`${policy.version} + 1`,
          updatedAt: input.now,
        })
        .where(eq(policy.id, input.id))
        .returning({ id: policy.id });
      return { id: row.id };
    }

    const [row] = await this.db
      .insert(policy)
      .values({
        name: input.name,
        description: input.description ?? null,
        ruleId: input.ruleId,
        severity: input.severity as "CRITICAL",
        enabled: input.enabled,
        createdBy: input.createdBy,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning({ id: policy.id });
    return { id: row.id };
  }

  /**
   * Policies with live compliance.
   *
   * Evaluated here against each machine's latest report — a policy never
   * reaches a machine, so "violating" means "last reported a finding matching
   * this rule", nothing more.
   */
  async listPolicies(): Promise<PolicyRecord[]> {
    const policies = await this.db
      .select()
      .from(policy)
      .orderBy(desc(policy.updatedAt));
    if (policies.length === 0) {
      return [];
    }

    const latest = this.db
      .selectDistinctOn([hostReport.hostId], {
        id: hostReport.id,
        hostId: hostReport.hostId,
      })
      .from(hostReport)
      .where(eq(hostReport.findingsReported, true))
      .orderBy(hostReport.hostId, desc(hostReport.receivedAt))
      .as("latest");

    const violations = await this.db
      .select({
        ruleId: hostFinding.ruleId,
        machines: sql<number>`cast(count(distinct ${hostFinding.hostId}) as int)`,
      })
      .from(hostFinding)
      .innerJoin(latest, eq(hostFinding.reportId, latest.id))
      .where(eq(hostFinding.suppressed, false))
      .groupBy(hostFinding.ruleId);

    const [{ evaluated } = { evaluated: 0 }] = await this.db
      .select({
        evaluated: sql<number>`cast(count(distinct ${hostReport.hostId}) as int)`,
      })
      .from(hostReport)
      .where(eq(hostReport.findingsReported, true));

    const byRule = new Map(violations.map((v) => [v.ruleId, v.machines]));

    return policies.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      ruleId: row.ruleId,
      severity: row.severity,
      version: row.version,
      enabled: row.enabled,
      createdBy: row.createdBy,
      updatedAt: row.updatedAt,
      violatingMachines: row.enabled ? (byRule.get(row.ruleId) ?? 0) : 0,
      evaluatedMachines: evaluated,
    }));
  }
}
