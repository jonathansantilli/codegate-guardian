import { z } from "zod";
import { normalizeEnrolmentCode } from "@/lib/security/enrolment-code";
import { getContainer } from "@/src/infrastructure";

/**
 * Exchanges a single-use enrolment code for the token a machine reports with.
 *
 * Deliberately unauthenticated: the code IS the credential, and a machine
 * being enrolled has nothing else to present. That is why codes are capped,
 * expiring, and spent atomically — a leaked code can enrol at most the number
 * of machines it was minted for, and only until it expires.
 */

const bodySchema = z.object({
  code: z.string().min(1).max(64),
  machineId: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const container = getContainer();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid enrolment request" }, { status: 400 });
  }

  const token = container.env.AGENT_INGEST_TOKEN;
  if (!token) {
    return Response.json(
      { error: "This server is not accepting agents: no ingest token is configured." },
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
      { error: "That enrolment code cannot be used. Ask an operator for a new one." },
      { status: 403 }
    );
  }

  return Response.json({ token, server: container.env.APP_URL });
}
