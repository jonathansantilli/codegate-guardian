import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type {
  ArtifactGroup,
  FleetRepository,
  HostDetail,
  HostSummary,
  RecordedReport,
  RecordHostReportInput,
} from "@/src/application/ports/fleet/fleet-repository";
import type {
  InventoryItemKind,
  InventoryScope,
} from "@/src/domain/fleet/entities/host";
import type { DrizzleDb } from "../client";
import { host, hostInventoryItem, hostReport } from "../schema";

// Postgres caps a statement at 65535 bound parameters; inventory rows bind
// well under a hundred each, so chunking keeps a large machine's report from
// exceeding that in a single insert.
const ITEM_INSERT_CHUNK = 500;

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
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
}
