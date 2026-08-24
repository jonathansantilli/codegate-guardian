import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { GuardianError } from "@/lib/errors";
import { getContainer } from "@/src/infrastructure";

const bodySchema = z.object({
  hostId: z.string().uuid(),
  fingerprint: z.string().min(1).max(200),
  note: z.string().trim().max(2000).optional(),
});

// Taking responsibility for a finding. Deliberately does not close it: only a
// later report that no longer carries the finding can do that.
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

  await fleet.acknowledgeFinding({
    ...parsed.data,
    acknowledgedBy: actor,
    acknowledgedAt: now,
  });

  await fleet.recordActivity({
    occurredAt: now,
    actorKind: "person",
    actorName: actor,
    action: "Acknowledged a finding",
    target: parsed.data.fingerprint,
    result: "Recorded",
    apiCall: "POST /api/fleet/acknowledge",
  });

  return Response.json({ ok: true });
}
