import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type {
  ActivityRecord,
  ArtifactGroup,
  ArtifactVariant,
  ArtifactVariantDetail,
  AttentionRow,
  EnrolHostResult,
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
  SavePolicyResult,
  SuppressFindingInput,
  Suppression,
} from "@/src/application/ports/fleet/fleet-repository";
import type {
  InventoryItemKind,
  InventoryScope,
} from "@/src/domain/fleet/entities/host";
import { severityRank } from "@/src/domain/scan/value-objects/severity";
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

/** Reports kept on a machine's history panel. */
const REPORT_HISTORY_LIMIT = 20;

/** Rows the attention queue returns before the caller asks for more. */
const ATTENTION_LIMIT = 50;

/** Rejected check-ins listed on the overview. */
const REJECTION_LIMIT = 20;

const HOUR_MS = 60 * 60 * 1000;

/**
 * How long a restore leaves a machine open to re-enrol.
 *
 * The window has no credential of its own — any live enrolment code opens it,
 * and a cohort code is held by every machine in the cohort — so its only real
 * bound is time. An agent that is running comes back on its next check-in;
 * an hour is generous for that and short enough that a forgotten restore is
 * not a standing invitation.
 */
const RESTORE_WINDOW_MS = 60 * 60 * 1000;

/** How far back the overview's check-in chart reaches. */
const CHECK_IN_WINDOW_HOURS = 24;

/**
 * A machine counts as reporting if it has been heard from inside this window.
 * The agent reports every six hours, so a full day of silence is a machine
 * that has stopped, not one that is merely between reports.
 */
const REPORTING_WINDOW_MS = 24 * HOUR_MS;

/**
 * An artifact's display name: the last segment of its path.
 *
 * Handles both separators, because a Windows agent reports
 * `C:\\Users\\x\\.claude\\skills\\foo\\SKILL.md` and a slash-only split would
 * make the whole path the name — so Windows machines would never group with
 * each other, let alone with anyone else.
 */
export function artifactName(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const segments = trimmed.split(/[/\\]/);
  return segments.at(-1) || trimmed || path;
}

/** The same rule in SQL, for grouping that has to happen in the database. */
// Backslashes are folded to slashes before taking the last segment: a
// character class containing a backslash has to survive both the SQL string
// literal and the regex parser, and chr(92) is unambiguous in a way that
// escaping is not. Trailing separators are trimmed first so this and
// `artifactName` cannot disagree — the grouping now depends on them matching,
// and a path ending in a slash otherwise yielded "" here and the whole path
// there, rendering a blank row in the inventory.
const SQL_ARTIFACT_NAME = sql`regexp_replace(regexp_replace(translate(${hostInventoryItem.path}, chr(92), '/'), '/+$', ''), '^.*/', '')`;

/**
 * The host columns the console is allowed to see.
 *
 * Explicit rather than `select()`, because SELECT * shipped
 * `agentTokenHash` to every session through /api/fleet and /api/fleet/host.
 * It is a SHA-256 and grants nothing today — the request path hashes a real
 * token to look a machine up — but a stored credential has no business in a
 * response body, and `machineTokenMatches` already exists for anyone who
 * later wires a hash comparison to a header.
 */
const HOST_COLUMNS = {
  id: host.id,
  machineId: host.machineId,
  hostname: host.hostname,
  platform: host.platform,
  osRelease: host.osRelease,
  username: host.username,
  owner: host.owner,
  team: host.team,
  agentVersion: host.agentVersion,
  firstSeenAt: host.firstSeenAt,
  lastSeenAt: host.lastSeenAt,
  revokedAt: host.revokedAt,
  revokedBy: host.revokedBy,
  enrolledAt: host.enrolledAt,
  enrolmentOpen: host.enrolmentOpen,
  enrolmentOpenedAt: host.enrolmentOpenedAt,
} as const;

/** Postgres reports a unique-constraint breach with this code. */
const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

/** Written by the ingest endpoint when a check-in is turned away. */
const CHECK_IN_REJECTED = "Check-in rejected";
const ENROLMENT_REFUSED = "Enrolment refused";

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
      .select(HOST_COLUMNS)
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
      .orderBy(
        hostReport.hostId,
        desc(hostReport.receivedAt),
        desc(hostReport.collectedAt),
        desc(hostReport.id)
      );

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

  async revokeHost({
    hostId,
    revokedAt,
    revokedBy,
  }: {
    hostId: string;
    revokedAt: Date;
    revokedBy: string;
  }): Promise<void> {
    await this.db
      .update(host)
      .set({ revokedAt, revokedBy })
      .where(eq(host.id, hostId));
  }

  async restoreHost({
    hostId,
    at = new Date(),
  }: {
    hostId: string;
    at?: Date;
  }): Promise<void> {
    // The withdrawn credential is retired with the revocation — a token that
    // was revoked should never work again — and the machine is opened for one
    // enrolment so it can come back. Both halves are the operator's act, which
    // is what makes the credential-less window safe to exist at all.
    await this.db
      .update(host)
      .set({
        revokedAt: null,
        revokedBy: null,
        agentTokenHash: null,
        enrolmentOpen: true,
        // Stamped, so the window closes on its own if the machine never
        // comes back. An operator who restores and then forgets should not
        // be leaving a slot open for the rest of the instance's life.
        enrolmentOpenedAt: at,
      })
      .where(eq(host.id, hostId));
  }

  async findHostByTokenHash(tokenHash: string) {
    const [row] = await this.db
      .select()
      .from(host)
      .where(eq(host.agentTokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  async enrolHost({
    machineId,
    tokenHash,
    enrolledAt,
  }: {
    machineId: string;
    tokenHash: string;
    enrolledAt: Date;
  }): Promise<EnrolHostResult> {
    // Enrolling can bind a machine that has no token yet, or re-bind one an
    // operator has revoked — both deliberate. What it must NOT do is rebind a
    // machine that is enrolled and healthy: a machineId is a claim in an
    // unauthenticated request body, so an upsert let anyone holding a code
    // overwrite another machine's token. That locked the real machine out and
    // handed its identity — and the power to resolve its findings — away.
    // Enrolment binds a machine that holds no credential. It never takes one
    // from a machine that does: a machineId is a claim in an unauthenticated
    // body, so re-binding let anyone holding a cohort code — which every
    // machine in that cohort holds by design — seize an existing machine,
    // locking the real one out and inheriting its findings.
    //
    // A revoked machine is refused whatever state its credential is in,
    // because it is precisely the machine we have decided not to trust and it
    // must not lift its own revocation. Re-admitting one is Restore, which is
    // an authenticated operator action and which clears the credential so the
    // machine enrols afresh.
    //
    // An existing machine may bind a credential only through a window an
    // operator opened for it. "Holds no token" is NOT the same as "is
    // available": a restored machine, or one predating per-machine tokens,
    // sits credential-less for as long as it takes to enrol, and treating
    // that as open let anyone holding a cohort code walk into the slot and
    // inherit the machine — the takeover this design exists to prevent,
    // reached through the front door instead of the back.
    const existing = await this.findHostByMachineId(machineId);
    if (existing) {
      const [rebound] = await this.db
        .update(host)
        .set({
          agentTokenHash: tokenHash,
          enrolledAt,
          enrolmentOpen: false,
          enrolmentOpenedAt: null,
        })
        // Every condition re-checked in the UPDATE, so the window cannot be
        // consumed twice: two enrolments racing for one open slot both read
        // it open, and the second finds the predicate false and gets nothing.
        .where(
          and(
            eq(host.id, existing.id),
            eq(host.enrolmentOpen, true),
            isNull(host.agentTokenHash),
            isNull(host.revokedAt),
            // Null: the upgrade backfill, which does not expire. Stamped: an
            // operator's restore, which does.
            or(
              isNull(host.enrolmentOpenedAt),
              gt(
                host.enrolmentOpenedAt,
                new Date(enrolledAt.getTime() - RESTORE_WINDOW_MS)
              )
            )
          )
        )
        .returning({ id: host.id });

      return rebound
        ? { outcome: "enrolled", hostId: rebound.id }
        : { outcome: "already-enrolled" };
    }

    // DoNothing, not DoUpdate. The check above closes the ordinary case, but
    // two enrolments of the same new machineId arriving together would both
    // pass it — and an update-on-conflict would let the second overwrite the
    // first's token, locking out a machine that had just enrolled honestly.
    // Losing the race is the same answer as finding the row already there.
    const [row] = await this.db
      .insert(host)
      .values({
        machineId,
        hostname: machineId,
        agentTokenHash: tokenHash,
        enrolledAt,
        firstSeenAt: enrolledAt,
        lastSeenAt: enrolledAt,
      })
      .onConflictDoNothing({ target: host.machineId })
      .returning({ id: host.id });

    if (!row) {
      return { outcome: "already-enrolled" };
    }

    return { outcome: "enrolled", hostId: row.id };
  }

  async findHostByMachineId(machineId: string) {
    const [row] = await this.db
      .select()
      .from(host)
      .where(eq(host.machineId, machineId))
      .limit(1);
    return row ?? null;
  }

  async findHostDetail(hostId: string): Promise<HostDetail | null> {
    const [hostRow] = await this.db
      .select(HOST_COLUMNS)
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
      .orderBy(
        desc(hostReport.receivedAt),
        desc(hostReport.collectedAt),
        desc(hostReport.id)
      )
      .limit(1);

    if (!report) {
      return {
        host: hostRow,
        lastCollectedAt: null,
        kbVersion: null,
        items: [],
        itemsChecked: 0,
        findings: [],
        reports: [],
      };
    }

    // The agent probes every path a tool could use and reports all of them,
    // present or not. Only the ones that are there are artifacts — counting
    // the misses as inventory overstates a machine several times over, and
    // disagrees with the fleet-wide artifact list, which already filters them.
    const probed = await this.db
      .select()
      .from(hostInventoryItem)
      .where(eq(hostInventoryItem.reportId, report.id))
      .orderBy(hostInventoryItem.tool, hostInventoryItem.path);
    const items = probed.filter((item) => item.exists);

    return {
      host: hostRow,
      lastCollectedAt: report.collectedAt,
      kbVersion: report.kbVersion,
      itemsChecked: probed.length,
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
      .orderBy(
        desc(hostReport.receivedAt),
        desc(hostReport.collectedAt),
        desc(hostReport.id)
      )
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

    // An operator's suppression has to reach here too. Filtering only on the
    // agent-side flag meant a fleet-wide suppression emptied the queue while
    // the machine's own page still showed a red "1 open · 1 critical" badge.
    const live = await this.liveSuppressions();
    return rows
      .filter((row) => !isSuppressedBy(live, { ...row, hostId }))
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
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
      .orderBy(
        desc(hostReport.receivedAt),
        desc(hostReport.collectedAt),
        desc(hostReport.id)
      )
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
        and(
          inArray(
            hostFinding.reportId,
            reports.map((r) => r.id)
          ),
          // The Findings tab excludes these; the History tab counted them, so
          // one machine read "1 open" beside "Findings 2".
          eq(hostFinding.suppressed, false)
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
      .orderBy(
        hostReport.hostId,
        desc(hostReport.receivedAt),
        desc(hostReport.collectedAt),
        desc(hostReport.id)
      )
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
      // A revoked machine cannot report again, so its findings can never
      // close. Leaving them here would mean a permanent, unactionable row at
      // the top of "act on these first".
      .where(and(eq(hostFinding.suppressed, false), isNull(host.revokedAt)));

    const live = await this.liveSuppressions();
    const acknowledgements = await this.acknowledgementsByHost();
    const visible = rows
      .filter((row) => !isSuppressedBy(live, row))
      .map((row) => ({
        ...row,
        acknowledgedBy:
          acknowledgements.get(`${row.hostId}::${row.fingerprint}`)?.by ?? null,
      }));

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
    // A revoked machine is not part of the fleet being measured: this server
    // refuses its reports, so its findings can never be resolved and would
    // sit in the queue forever with no action available. Its record stays —
    // the Machines page lists it under its own filter — but it is out of
    // every active count, which is also what the Machines page already did.
    const allHosts = await this.db.select().from(host);
    const hosts = allHosts.filter((row) => row.revokedAt === null);
    const attention = await this.listAttention(Number.MAX_SAFE_INTEGER);

    const reportingSince = new Date(now.getTime() - REPORTING_WINDOW_MS);
    const dayStart = new Date(now.getTime() - CHECK_IN_WINDOW_HOURS * HOUR_MS);

    // Returned as epoch milliseconds rather than a timestamp: a raw sql<Date>
    // expression skips Drizzle's timestamp mapper, so postgres.js parses the
    // bare `timestamp without time zone` as the SERVER's local time and every
    // bucket comes back shifted by its UTC offset — on a card labelled UTC,
    // beside a "last check-in" stat read from a typed column that is correct.
    const perHour = await this.db
      .select({
        hourMs: sql<string>`(extract(epoch from date_trunc('hour', ${hostReport.receivedAt})) * 1000)::bigint`,
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
    const acknowledged = await this.acknowledgedOnHost();

    // The newest feed among what LIVE machines CURRENTLY report.
    //
    // Ordering by arrival made one machine on an old feed, reporting last,
    // look like the whole fleet was stale. Taking the max over every report
    // ever stored fixed that and broke it the other way: a version reported
    // once in February stood forever, so a fleet that had since been reimaged
    // onto an eight-month-old feed read as current. A false all-clear on a
    // staleness signal is worse than a false alarm — nobody investigates it.
    const latestPerHost = this.db
      .selectDistinctOn([hostReport.hostId], {
        kbVersion: hostReport.kbVersion,
        hostId: hostReport.hostId,
      })
      .from(hostReport)
      .orderBy(
        hostReport.hostId,
        desc(hostReport.receivedAt),
        desc(hostReport.collectedAt),
        desc(hostReport.id)
      )
      .as("latest_feed");

    const [newest] = await this.db
      .select({ kbVersion: latestPerHost.kbVersion })
      .from(latestPerHost)
      .innerJoin(host, eq(latestPerHost.hostId, host.id))
      .where(and(isNotNull(latestPerHost.kbVersion), isNull(host.revokedAt)))
      .orderBy(desc(latestPerHost.kbVersion))
      .limit(1);
    const newestKbVersion = newest?.kbVersion ?? null;

    const [newestReport] = await this.db
      .select({ receivedAt: hostReport.receivedAt })
      .from(hostReport)
      .orderBy(
        desc(hostReport.receivedAt),
        desc(hostReport.collectedAt),
        desc(hostReport.id)
      )
      .limit(1);

    return {
      hostsEnrolled: hosts.length,
      // A machine that has enrolled and never reported is not reporting.
      // Enrolment stamps lastSeenAt, so the timestamp alone said it was.
      hostsReporting: hosts
        .filter((h) => h.enrolledAt === null || h.lastSeenAt > h.enrolledAt)
        .filter((h) => h.lastSeenAt > reportingSince).length,
      ownersWithOpenFindings: new Set(
        attention.map((row) => row.owner ?? row.hostname)
      ).size,
      teamsWithOpenFindings: new Set(
        attention.map((row) => row.team ?? "Unassigned")
      ).size,
      openFindings: attention.length,
      attentionTotal: attention.length,
      hostsRevoked: allHosts.length - hosts.length,
      machinesWithFindings: new Set(attention.map((row) => row.hostId)).size,
      untriagedFindings: attention.filter(
        (row) => !acknowledged.has(`${row.hostId}::${row.fingerprint}`)
      ).length,
      checkInsPerHour: perHour.map((row) => ({
        hour: new Date(Number(row.hourMs)),
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

  /**
   * Which findings are acknowledged, ON WHICH MACHINE.
   *
   * The table is keyed (hostId, fingerprint) because taking responsibility is
   * per machine — the same malicious skill on two laptops is two people to
   * talk to. Reading it per fingerprint marked both triaged when one was.
   */
  /** Who acknowledged what, per machine, for the screens that act per machine. */
  private async acknowledgementsByHost(): Promise<
    Map<string, { by: string; at: Date }>
  > {
    const rows = await this.db.select().from(findingAcknowledgement);
    return new Map(
      rows.map((row) => [
        `${row.hostId}::${row.fingerprint}`,
        { by: row.acknowledgedBy, at: row.acknowledgedAt },
      ])
    );
  }

  private async acknowledgedOnHost(): Promise<Set<string>> {
    const rows = await this.db
      .select({
        hostId: findingAcknowledgement.hostId,
        fingerprint: findingAcknowledgement.fingerprint,
      })
      .from(findingAcknowledgement);
    return new Set(rows.map((row) => `${row.hostId}::${row.fingerprint}`));
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
      .orderBy(
        hostReport.hostId,
        desc(hostReport.receivedAt),
        desc(hostReport.collectedAt),
        desc(hostReport.id)
      )
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

    const name = artifactName(rows[0].path);

    // Every other distinct file sharing this name — the variant next to it is
    // usually the one it is being mistaken for.
    const siblingRows = await this.db
      .select({
        contentHash: hostInventoryItem.contentHash,
        paths: sql<string[]>`array_agg(distinct ${hostInventoryItem.path})`,
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
          sql`${SQL_ARTIFACT_NAME} = ${name}`
        )
      )
      .groupBy(hostInventoryItem.contentHash);

    const siblings: ArtifactVariant[] = siblingRows
      .filter((row) => row.contentHash !== contentHash)
      .map((row) => ({
        contentHash: row.contentHash as string,
        machineCount: row.machineCount,
        firstSeenAt: new Date(row.firstSeenAt),
        paths: row.paths,
      }));

    // One row per inventory item, so a machine carrying these bytes at two
    // paths appears twice — as two machines in the count, two rows in the
    // list under a duplicate key, and "the 2 machines carrying it" in the
    // suppression confirmation. Collapse to one entry per machine, keeping
    // every path it was found at.
    const byMachine = new Map<
      string,
      ArtifactVariantDetail["machines"][number]
    >();
    for (const row of rows) {
      const existing = byMachine.get(row.hostId);
      if (existing) {
        if (!existing.paths.includes(row.path)) {
          existing.paths.push(row.path);
        }
        continue;
      }
      byMachine.set(row.hostId, {
        hostId: row.hostId,
        hostname: row.hostname,
        owner: row.owner,
        team: row.team,
        paths: [row.path],
        lastSeenAt: row.lastSeenAt,
      });
    }

    return {
      contentHash,
      name,
      tool: rows[0].tool,
      kind: rows[0].kind as InventoryItemKind,
      firstSeenAt: new Date(
        Math.min(...rows.map((row) => row.collectedAt.getTime()))
      ),
      machines: [...byMachine.values()],
      siblings,
    };
  }

  async listArtifactGroups(): Promise<ArtifactGroup[]> {
    const latest = this.db
      .selectDistinctOn([hostReport.hostId], {
        id: hostReport.id,
      })
      .from(hostReport)
      .orderBy(
        hostReport.hostId,
        desc(hostReport.receivedAt),
        desc(hostReport.collectedAt),
        desc(hostReport.id)
      )
      .as("latest");

    const rows = await this.db
      .select({
        tool: hostInventoryItem.tool,
        kind: hostInventoryItem.kind,
        contentHash: hostInventoryItem.contentHash,
        // Grouped by NAME as well as hash, and aggregating the paths beneath.
        // By path alone, the same bytes under two home directories read as
        // "same name, different bytes" — the opposite of identity-by-content.
        // By hash alone, one hash under two names (CLAUDE.md and AGENTS.md,
        // byte-identical) collapsed into whichever name came first and the
        // other vanished from the inventory entirely.
        name: sql<string>`${SQL_ARTIFACT_NAME}`,
        machineCount: sql<number>`cast(count(distinct ${hostInventoryItem.hostId}) as int)`,
        firstSeenAt: sql<Date>`min(${hostReport.collectedAt})`,
        paths: sql<string[]>`array_agg(distinct ${hostInventoryItem.path})`,
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
        hostInventoryItem.contentHash,
        SQL_ARTIFACT_NAME
      );

    // Group by the artifact's display name, but keep each hash separate
    // inside it — the name is a label, the hash is the identity.
    const groups = new Map<string, ArtifactGroup>();

    for (const row of rows) {
      // The name the database grouped by, so this partition and the
      // per-name machine count below agree on what a group is.
      const name = row.name;
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
        paths: row.paths,
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
        name: sql<string>`${SQL_ARTIFACT_NAME}`,
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
        SQL_ARTIFACT_NAME
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
      .orderBy(
        hostReport.hostId,
        desc(hostReport.receivedAt),
        desc(hostReport.collectedAt),
        desc(hostReport.id)
      )
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
      .innerJoin(host, eq(hostFinding.hostId, host.id))
      .leftJoin(latest, eq(hostFinding.hostId, latest.hostId))
      // Revoked machines are excluded here as they are from the attention
      // queue. Without this, their findings sat Open on a machine that can
      // never report again — present on nothing, impossible to resolve, and
      // still counted in the nav badge.
      .where(and(eq(hostFinding.suppressed, false), isNull(host.revokedAt)));

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
      .orderBy(
        hostReport.hostId,
        hostReport.receivedAt,
        hostReport.collectedAt,
        hostReport.id
      );

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
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
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

    // Only what machines currently report, and one machine counted once.
    // Counting every historical row meant a single laptop reporting the same
    // finding every six hours read as 28 machines — under a column headed
    // "Machines", in the confirmation shown before agreeing to hide it.
    const latest = this.db
      .selectDistinctOn([hostReport.hostId], { id: hostReport.id })
      .from(hostReport)
      .where(eq(hostReport.findingsReported, true))
      .orderBy(
        hostReport.hostId,
        desc(hostReport.receivedAt),
        desc(hostReport.collectedAt),
        desc(hostReport.id)
      )
      .as("latest");

    const counts = await this.db
      .selectDistinct({
        fingerprint: hostFinding.fingerprint,
        ruleId: hostFinding.ruleId,
        hostId: hostFinding.hostId,
      })
      .from(hostFinding)
      .innerJoin(latest, eq(hostFinding.reportId, latest.id))
      .innerJoin(host, eq(hostFinding.hostId, host.id))
      .where(isNull(host.revokedAt));

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
      blastRadius: new Set(
        counts
          .filter(
            (c) =>
              (row.fingerprint ? c.fingerprint === row.fingerprint : true) &&
              (row.ruleId ? c.ruleId === row.ruleId : true) &&
              (row.hostId ? c.hostId === row.hostId : true)
          )
          .map((c) => c.hostId)
      ).size,
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
  async recordRejectionThrottled({
    kind = "check-in",
    reason,
    at,
    windowMs,
    actorName,
  }: {
    kind?: "check-in" | "enrolment";
    reason: string;
    at: Date;
    windowMs: number;
    actorName?: string;
  }): Promise<void> {
    const action = kind === "enrolment" ? ENROLMENT_REFUSED : CHECK_IN_REJECTED;
    // One row per window, enforced by a unique index rather than by looking
    // first. The caller reaching this path is unauthenticated, so it can fire
    // concurrently — and every concurrent select reads "nothing recent" before
    // any of them inserts. Fixed windows rather than sliding: the bucket is
    // what the index can be unique on.
    const bucket = Math.floor(at.getTime() / windowMs);

    await this.db
      .insert(activityEvent)
      .values({
        occurredAt: at,
        actorKind: "agent",
        // Deliberately not the hostname the caller claimed: an unauthenticated
        // request has no identity, and letting it name itself here let an
        // attacker both flood and mislabel the audit trail.
        actorName: actorName ?? "unidentified machine",
        action,
        target: null,
        result: reason,
        apiCall:
          kind === "enrolment"
            ? "POST /api/agent/enrol"
            : "POST /api/agent/report",
        // The actor is resolved from a credential, never from the payload, so
        // the key space is bounded by the machines that exist.
        throttleKey: `${action}:${reason}:${actorName ?? ""}:${bucket}`,
      })
      .onConflictDoNothing({ target: activityEvent.throttleKey });
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

  async savePolicy(input: SavePolicyInput): Promise<SavePolicyResult> {
    // A name collision is a person naming two rules the same thing, not a
    // server fault. The constraint is what decides — a check-then-insert is a
    // race two concurrent creates both win, and the second still 500s.
    try {
      return await this.writePolicy(input);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { outcome: "name-taken" };
      }
      throw error;
    }
  }

  private async writePolicy(input: SavePolicyInput): Promise<SavePolicyResult> {
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

      // An id that matches nothing updates nothing; reading .id off the
      // absent row was an unhandled 500.
      return row ? { outcome: "saved", id: row.id } : { outcome: "not-found" };
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

    return { outcome: "saved", id: row.id };
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
      .orderBy(
        hostReport.hostId,
        desc(hostReport.receivedAt),
        desc(hostReport.collectedAt),
        desc(hostReport.id)
      )
      .as("latest");

    // Rows rather than a grouped count, so an operator's suppressions can be
    // applied per machine before counting. Grouping in SQL made a suppressed
    // rule still read "1 of 1 violating" on the Policies page while the
    // Overview said every machine passed.
    const violationRows = await this.db
      .select({
        ruleId: hostFinding.ruleId,
        hostId: hostFinding.hostId,
        fingerprint: hostFinding.fingerprint,
      })
      .from(hostFinding)
      .innerJoin(latest, eq(hostFinding.reportId, latest.id))
      .innerJoin(host, eq(hostFinding.hostId, host.id))
      // The evaluated count already excludes revoked machines. Without the
      // same filter here the two measured different fleets, and a policy
      // whose only violator had been revoked read "0 of 1 passing" while the
      // Overview said every live machine passed.
      .where(and(eq(hostFinding.suppressed, false), isNull(host.revokedAt)));

    const live = await this.liveSuppressions();
    const machinesByRule = new Map<string, Set<string>>();
    for (const row of violationRows) {
      if (isSuppressedBy(live, row)) {
        continue;
      }
      const machines = machinesByRule.get(row.ruleId) ?? new Set<string>();
      machines.add(row.hostId);
      machinesByRule.set(row.ruleId, machines);
    }

    const [{ evaluated } = { evaluated: 0 }] = await this.db
      .select({
        evaluated: sql<number>`cast(count(distinct ${hostReport.hostId}) as int)`,
      })
      .from(hostReport)
      .innerJoin(host, eq(hostReport.hostId, host.id))
      // Same fleet the Overview measures: a revoked machine is not evaluated.
      .where(
        and(eq(hostReport.findingsReported, true), isNull(host.revokedAt))
      );

    const byRule = new Map(
      [...machinesByRule].map(([ruleId, machines]) => [ruleId, machines.size])
    );

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
