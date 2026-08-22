import { extractBearerToken } from "@/lib/security/agent-token";
import { hashMachineToken } from "@/lib/security/machine-token";
import {
  agentReportPayloadSchema,
  type FindingPayload,
  type InventoryItemPayload,
} from "@/src/application/ports/fleet/agent-report-payload";
import type {
  RecordFindingInput,
  RecordInventoryItemInput,
} from "@/src/application/ports/fleet/fleet-repository";
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
    contentHash: item.sha256 ?? null,
    riskSurface: item.risk_surface,
    resolvedAgainst: item.resolved_against ?? null,
  };
}

function toFindingInput(finding: FindingPayload): RecordFindingInput {
  return {
    findingId: finding.finding_id,
    ruleId: finding.rule_id,
    // A finding with no fingerprint cannot be followed across reports; its own
    // id is the next best stable handle.
    fingerprint: finding.fingerprint ?? finding.finding_id,
    severity: finding.severity,
    category: finding.category ?? null,
    layer: finding.layer ?? null,
    filePath: finding.file_path ?? null,
    contentHash: finding.sha256 ?? null,
    line: finding.line ?? null,
    column: finding.column ?? null,
    description: finding.description,
    evidence: finding.evidence ?? null,
    owasp: finding.owasp,
    cwe: finding.cwe ?? null,
    confidence: finding.confidence ?? null,
    fixable: finding.fixable ?? null,
    suppressed: finding.suppressed ?? false,
  };
}

/**
 * Reasons a check-in is turned away at the door, before anything it sent is
 * trusted. The console groups rejections by these, so they are constants
 * rather than strings written at each call site.
 */
export const REJECTION_NO_TOKEN = "401 no_token_configured";
export const REJECTION_INVALID_TOKEN = "401 unknown_token";
export const REJECTION_REVOKED = "403 enrolment_revoked";

/** Longest hostname worth keeping from an unauthenticated caller. */
const MAX_REJECTED_HOSTNAME = 64;

/**
 * Records a check-in that was refused.
 *
 * The body is unauthenticated, so only a length-capped hostname is taken from
 * it and only when the request is small enough to be a real report; anything
 * unreadable is recorded as an unnamed machine rather than not at all.
 */
async function recordRejection(
  container: ReturnType<typeof getContainer>,
  request: Request,
  { reason }: { reason: string }
): Promise<void> {
  let hostname = "unknown machine";

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 0 && declaredLength <= MAX_BODY_BYTES) {
    try {
      const body = (await request.json()) as { host?: { hostname?: unknown } };
      const reported = body?.host?.hostname;
      if (typeof reported === "string" && reported.trim()) {
        hostname = reported.trim().slice(0, MAX_REJECTED_HOSTNAME);
      }
    } catch {
      // Unreadable body from an unauthenticated caller. The rejection still
      // matters; the name it claimed does not.
    }
  }

  try {
    await container.ports.fleet.recordActivity({
      occurredAt: new Date(),
      actorKind: "agent",
      actorName: hostname,
      action: "Check-in rejected",
      target: null,
      result: reason,
      apiCall: "POST /api/agent/report",
    });
  } catch {
    // Never let bookkeeping turn a 401 into a 500.
  }
}

export async function POST(request: Request) {
  const container = getContainer();

  const token = extractBearerToken(request.headers.get("authorization"));

  // The token says which machine this is. Nothing in the body does — an agent
  // that could name its own machine could name someone else's, and a report
  // omitting their findings would mark them clean.
  const reporting = token
    ? await container.ports.fleet.findHostByTokenHash(hashMachineToken(token))
    : null;

  if (!reporting) {
    // A rejected check-in is the single most useful thing an operator can see
    // when nothing is arriving, so it is recorded rather than dropped: the
    // console can then say which machines tried and why they were turned away.
    await recordRejection(container, request, {
      reason: container.env.AGENT_INGEST_TOKEN
        ? REJECTION_INVALID_TOKEN
        : REJECTION_NO_TOKEN,
    });
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

  // A revoked machine keeps running and keeps reporting — the server cannot
  // tell it to stop. Closing the door here is the whole of what revocation
  // means, so the refusal is recorded like any other rejected check-in. The
  // machine is the one the token belongs to, so renaming itself does not help.
  if (reporting.revokedAt) {
    await container.ports.fleet.recordActivity({
      occurredAt: receivedAt,
      actorKind: "agent",
      actorName: reporting.hostname,
      action: "Check-in rejected",
      target: null,
      result: REJECTION_REVOKED,
      apiCall: "POST /api/agent/report",
    });
    return Response.json({ error: "Enrolment revoked" }, { status: 403 });
  }

  try {
    const { hostId, reportId } = await container.ports.fleet.recordReport({
      // Not payload.agent.machineId: identity comes from the credential.
      machineId: reporting.machineId,
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
      // Undefined stays undefined: an inventory-only report must not be read
      // as "this machine is clean".
      findings: payload.findings?.map(toFindingInput),
    });

    await container.ports.fleet.recordActivity({
      occurredAt: receivedAt,
      actorKind: "agent",
      actorName: payload.host.hostname,
      action: "Reported inventory",
      target: `${payload.inventory.items.length} artifacts · ${payload.findings?.length ?? 0} findings`,
      result: "Accepted",
      apiCall: "POST /api/agent/report",
    });

    return Response.json({
      hostId,
      reportId,
      itemsAccepted: payload.inventory.items.length,
      findingsAccepted: payload.findings?.length ?? null,
      // Reserved for the policy phase. Agents should apply what they find here
      // and treat an empty rule set as "no policy configured".
      policy: { version: null, rules: [] },
    });
  } catch (error) {
    console.error("Agent report ingest failed:", error);
    return Response.json({ error: "Failed to store report" }, { status: 500 });
  }
}
