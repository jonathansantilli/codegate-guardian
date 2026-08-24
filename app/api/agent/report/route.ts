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
// Authenticated by the reporting machine's own bearer token rather than a
// user session: the caller is a machine, not a person. The response is an
// acknowledgement and nothing more. This server issues no instructions to a
// machine, so there is deliberately no field here an agent is expected to
// act on.

const MAX_BODY_BYTES = 8 * 1024 * 1024;

class BodyTooLargeError extends Error {}

/** Never later than arrival: a future collection time is not a real one. */
function clampToArrival(collectedAt: string, receivedAt: Date): Date {
  const collected = new Date(collectedAt);
  return collected > receivedAt ? receivedAt : collected;
}

/**
 * Reads the body, refusing to buffer more than MAX_BODY_BYTES.
 *
 * The Content-Length check above is only a courtesy to honest clients: a
 * chunked request omits the header entirely, so trusting it left the real
 * bound as whatever the framework happened to allow. This counts what
 * actually arrives and stops reading, so an unauthenticated-shaped caller
 * cannot make the server buffer an arbitrary amount of memory.
 */
async function readCappedBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

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

/**
 * How long one refusal stands for all the others like it.
 *
 * The operator needs to know check-ins are being refused and why; they do not
 * need one row per attempt, and an unauthenticated caller must not be able to
 * write enough of them to push the rest of the audit trail out of view.
 */
const REJECTION_WINDOW_MS = 5 * 60 * 1000;

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
    await container.ports.fleet.recordRejectionThrottled({
      // Which message, not whether to accept: a machine already enrolled
      // reports with its own token, and does so whether or not an ingest
      // token is currently configured. AGENT_INGEST_TOKEN gates enrolment.
      reason: container.env.AGENT_INGEST_TOKEN
        ? REJECTION_INVALID_TOKEN
        : REJECTION_NO_TOKEN,
      at: new Date(),
      windowMs: REJECTION_WINDOW_MS,
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Content-Length is the caller's claim, and a chunked request simply omits
  // it — so this is a fast rejection for honest clients, not the bound.
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Report too large" }, { status: 413 });
  }

  let raw: string;
  try {
    raw = await readCappedBody(request);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return Response.json({ error: "Report too large" }, { status: 413 });
    }
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
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
    // Throttled like any other refusal. A revoked machine keeps checking in
    // for as long as it keeps running, and one row per attempt would push
    // every other entry out of the rejection panel — the one place an
    // operator looks to find out what is being turned away.
    await container.ports.fleet.recordRejectionThrottled({
      reason: REJECTION_REVOKED,
      at: receivedAt,
      windowMs: REJECTION_WINDOW_MS,
      actorName: reporting.hostname,
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
      // Clamped to arrival. collectedAt is the agent's own clock and is
      // therefore whatever a compromised machine says it is — and it ranks
      // the attention queue, so an ancient value sinks a machine's own
      // CRITICAL row below everyone else's. A machine cannot have collected
      // data after the server received it; a clock behind is ordinary skew
      // and is left alone.
      collectedAt: clampToArrival(payload.collectedAt, receivedAt),
      receivedAt,
      kbVersion: payload.inventory.kb_version ?? null,
      toolsDetected: payload.inventory.tools,
      items: payload.inventory.items.map(toItemInput),
      // Undefined stays undefined: an inventory-only report must not be read
      // as "this machine is clean".
      findings: payload.findings?.map(toFindingInput),
    });

    // A hostname is self-reported: the agent reads it off the machine, and a
    // compromised one can claim any string, including another machine's. The
    // report itself is safe — attribution comes from the token — but the
    // console displays machines BY hostname, so a silent rename lets one
    // machine wear another's name in the list an operator triages by.
    // Renaming is legitimate (people rename laptops), so it is recorded
    // rather than refused.
    if (reporting.hostname !== payload.host.hostname) {
      await container.ports.fleet.recordActivity({
        occurredAt: receivedAt,
        actorKind: "agent",
        actorName: reporting.hostname,
        action: "Changed its reported hostname",
        target: `${reporting.hostname} → ${payload.host.hostname}`,
        result: "Recorded",
        apiCall: "POST /api/agent/report",
      });
    }

    await container.ports.fleet.recordActivity({
      occurredAt: receivedAt,
      actorKind: "agent",
      // The name the token resolved to, not the one the payload claimed.
      actorName: reporting.hostname,
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
    });
  } catch (error) {
    console.error("Agent report ingest failed:", error);
    return Response.json({ error: "Failed to store report" }, { status: 500 });
  }
}
