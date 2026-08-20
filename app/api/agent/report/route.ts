import {
  extractBearerToken,
  isValidAgentToken,
} from "@/lib/security/agent-token";
import {
  agentReportPayloadSchema,
  type InventoryItemPayload,
} from "@/src/application/ports/fleet/agent-report-payload";
import type { RecordInventoryItemInput } from "@/src/application/ports/fleet/fleet-repository";
import { getContainer } from "@/src/infrastructure";

// Agent check-in endpoint.
//
// Authenticated by a shared bearer token rather than a user session: the
// caller is a machine, not a person. The response carries a policy document
// so that pushing policy to machines later needs no new connectivity —
// agents already poll this endpoint and read what comes back.

const MAX_BODY_BYTES = 8 * 1024 * 1024;

function toItemInput(item: InventoryItemPayload): RecordInventoryItemInput {
  return {
    tool: item.tool,
    kind: item.kind,
    itemType: item.type ?? null,
    scope: item.scope,
    pattern: item.pattern ?? null,
    path: item.path,
    exists: item.exists,
    riskSurface: item.risk_surface,
    resolvedAgainst: item.resolved_against ?? null,
  };
}

export async function POST(request: Request) {
  const container = getContainer();

  const token = extractBearerToken(request.headers.get("authorization"));
  if (!isValidAgentToken(token, container.env.AGENT_INGEST_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Report too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = agentReportPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid report",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const receivedAt = new Date();

  try {
    const { hostId, reportId } = await container.ports.fleet.recordReport({
      machineId: payload.agent.machineId,
      hostname: payload.host.hostname,
      platform: payload.host.platform ?? null,
      osRelease: payload.host.osRelease ?? null,
      username: payload.host.username ?? null,
      agentVersion: payload.agent.version ?? null,
      collectedAt: new Date(payload.collectedAt),
      receivedAt,
      kbVersion: payload.inventory.kb_version ?? null,
      toolsDetected: payload.inventory.tools,
      items: payload.inventory.items.map(toItemInput),
    });

    return Response.json({
      hostId,
      reportId,
      itemsAccepted: payload.inventory.items.length,
      // Reserved for the policy phase. Agents should apply what they find here
      // and treat an empty rule set as "no policy configured".
      policy: { version: null, rules: [] },
    });
  } catch (error) {
    console.error("Agent report ingest failed:", error);
    return Response.json({ error: "Failed to store report" }, { status: 500 });
  }
}
