import { auth } from "@/app/(auth)/auth";
import { GuardianError } from "@/lib/errors";
import {
  type ExportFormat,
  type ExportKind,
  exportFilename,
  isExportFormat,
  isExportKind,
  toCsv,
} from "@/lib/security/fleet-export";
import { getContainer } from "@/src/infrastructure";

/**
 * Takes the console's data away with you.
 *
 * Deliberately the same endpoint the UI uses: an operator clicking Export and
 * a cron job running curl get identical bytes, which is the whole point of
 * the console being a client of its own API.
 */

const CONTENT_TYPE: Record<ExportFormat, string> = {
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
};

async function rows(
  kind: ExportKind,
  hostId: string | null
): Promise<Record<string, unknown>[]> {
  const fleet = getContainer().ports.fleet;

  if (kind === "machines") {
    const hosts = await fleet.listHostSummaries();
    return hosts
      .filter((entry) => !hostId || entry.host.id === hostId)
      .map((entry) => ({
        hostname: entry.host.hostname,
        owner: entry.host.owner,
        team: entry.host.team,
        platform: entry.host.platform,
        osRelease: entry.host.osRelease,
        agentVersion: entry.host.agentVersion,
        tools: entry.toolNames.join(" "),
        artifacts: entry.itemsTotal,
        firstSeenAt: entry.host.firstSeenAt,
        lastSeenAt: entry.host.lastSeenAt,
        machineId: entry.host.machineId,
      }));
  }

  if (kind === "findings") {
    const attention = await fleet.listAttention(Number.MAX_SAFE_INTEGER);
    return attention
      .filter((row) => !hostId || row.hostId === hostId)
      .map((row) => ({
        hostname: row.hostname,
        owner: row.owner,
        team: row.team,
        severity: row.severity,
        ruleId: row.ruleId,
        description: row.description,
        filePath: row.filePath,
        fingerprint: row.fingerprint,
        lastSeenAt: row.lastSeenAt,
      }));
  }

  if (kind === "inventory") {
    if (hostId) {
      const detail = await fleet.findHostDetail(hostId);
      return (detail?.items ?? []).map((item) => ({
        hostname: detail?.host.hostname ?? "",
        tool: item.tool,
        kind: item.kind,
        type: item.itemType,
        scope: item.scope,
        path: item.path,
        contentHash: item.contentHash,
        riskSurface: item.riskSurface.join(" "),
      }));
    }

    const artifacts = await fleet.listArtifactGroups();
    return artifacts.flatMap((group) =>
      group.variants.map((variant) => ({
        name: group.name,
        tool: group.tool,
        kind: group.kind,
        contentHash: variant.contentHash,
        machines: variant.machineCount,
        firstSeenAt: variant.firstSeenAt,
        path: variant.paths[0] ?? "",
      }))
    );
  }

  const activity = await fleet.listActivity(MAX_ACTIVITY_ROWS);
  return activity.map((row) => ({
    occurredAt: row.occurredAt,
    actorKind: row.actorKind,
    actorName: row.actorName,
    action: row.action,
    target: row.target,
    result: row.result,
    apiCall: row.apiCall,
  }));
}

/** Enough to cover any retention window an operator would reasonably export. */
const MAX_ACTIVITY_ROWS = 10_000;

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new GuardianError("unauthorized:fleet").toResponse();
  }

  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") ?? "machines";
  const format = params.get("format") ?? "csv";
  const hostId = params.get("hostId");

  if (!(isExportKind(kind) && isExportFormat(format))) {
    return Response.json(
      {
        error:
          "Unknown export. Ask for machines, findings, inventory or activity, as json or csv.",
      },
      { status: 400 }
    );
  }

  const data = await rows(kind, hostId);
  const now = new Date();
  const body =
    format === "json"
      ? JSON.stringify(
          { kind, exportedAt: now.toISOString(), rows: data },
          null,
          2
        )
      : toCsv(data);

  return new Response(body, {
    headers: {
      "content-type": CONTENT_TYPE[format],
      "content-disposition": `attachment; filename="${exportFilename(kind, format, now)}"`,
      "cache-control": "private, no-store",
    },
  });
}
