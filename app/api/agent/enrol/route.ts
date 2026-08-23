import { z } from "zod";
import { normalizeEnrolmentCode } from "@/lib/security/enrolment-code";
import {
  hashMachineToken,
  mintMachineToken,
} from "@/lib/security/machine-token";
import { getContainer } from "@/src/infrastructure";

/**
 * Exchanges a single-use enrolment code for the token a machine reports with.
 *
 * Deliberately unauthenticated: the code IS the credential, and a machine
 * being enrolled has nothing else to present. That is why codes are capped,
 * expiring, and spent atomically — a leaked code can enrol at most the number
 * of machines it was minted for, and only until it expires.
 *
 * The token returned belongs to this machine alone. It used to be the fleet's
 * shared ingest token, which meant any agent could report as any machine — and
 * since a finding closes by being absent from a later report, one hostile
 * agent could mark the whole fleet clean.
 */

const bodySchema = z.object({
  code: z.string().min(1).max(64),
  machineId: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const container = getContainer();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid enrolment request" },
      { status: 400 }
    );
  }

  // The configured ingest token no longer authenticates reports; its presence
  // is what says this server is accepting agents at all.
  if (!container.env.AGENT_INGEST_TOKEN) {
    return Response.json(
      {
        error:
          "This server is not accepting agents: no ingest token is configured.",
      },
      { status: 503 }
    );
  }

  const redeemed = await container.ports.fleet.redeemEnrolmentCode({
    code: normalizeEnrolmentCode(parsed.data.code),
    now: new Date(),
  });

  if (!redeemed) {
    // One message for every failure: unknown, expired, revoked, and spent are
    // all the same to a caller who should not be probing which.
    return Response.json(
      {
        error:
          "That enrolment code cannot be used. Ask an operator for a new one.",
      },
      { status: 403 }
    );
  }

  const token = mintMachineToken();
  const enrolledAt = new Date();

  const result = await container.ports.fleet.enrolHost({
    machineId: parsed.data.machineId,
    tokenHash: hashMachineToken(token),
    enrolledAt,
  });

  if (result.outcome === "already-enrolled") {
    await container.ports.fleet.recordActivity({
      occurredAt: enrolledAt,
      actorKind: "agent",
      actorName: parsed.data.machineId,
      action: "Enrolment refused",
      target: "machine is already enrolled",
      result: "409 already_enrolled",
      apiCall: "POST /api/agent/enrol",
    });

    return Response.json(
      {
        error:
          "That machine is already enrolled. If it needs a new credential, an operator must restore it — revoking alone does not release the machine id.",
      },
      { status: 409 }
    );
  }

  await container.ports.fleet.recordActivity({
    occurredAt: enrolledAt,
    actorKind: "agent",
    actorName: parsed.data.machineId,
    action: "Enrolled",
    target: "enrolment code redeemed",
    result: "Issued its own reporting token",
    apiCall: "POST /api/agent/enrol",
  });

  // The only time this token exists in plain text. The server keeps a hash.
  return Response.json({ token, server: container.env.APP_URL });
}
