import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { GuardianError } from "@/lib/errors";
import { getContainer } from "@/src/infrastructure";

const bodySchema = z.object({
  hostId: z.string().uuid(),
  /** false restores a machine whose enrolment was withdrawn. */
  revoked: z.boolean(),
});

/**
 * Withdraws or restores a machine's enrolment.
 *
 * This closes the door on this server; it does not reach the machine. The
 * agent there keeps running and keeps trying, and its last report stays
 * visible so an operator can still see what was on it.
 */
export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new GuardianError("unauthorized:fleet").toResponse();
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new GuardianError("bad_request:api").toResponse();
  }

  const actor = session.user.email ?? session.user.id ?? "unknown";
  const fleet = getContainer().ports.fleet;
  const now = new Date();

  if (parsed.data.revoked) {
    await fleet.revokeHost({
      hostId: parsed.data.hostId,
      revokedAt: now,
      revokedBy: actor,
    });
  } else {
    await fleet.restoreHost({ hostId: parsed.data.hostId });
  }

  await fleet.recordActivity({
    occurredAt: now,
    actorKind: "person",
    actorName: actor,
    action: parsed.data.revoked
      ? "Revoked an enrolment"
      : "Restored an enrolment",
    target: parsed.data.hostId,
    result: parsed.data.revoked ? "Reports refused" : "Reports accepted",
    apiCall: "POST /api/fleet/machines",
  });

  return Response.json({ ok: true });
}
