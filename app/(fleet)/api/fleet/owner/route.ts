import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { GuardianError } from "@/lib/errors";
import { getContainer } from "@/src/infrastructure";

const bodySchema = z.object({
  hostId: z.string().uuid(),
  owner: z.string().trim().max(200).nullable(),
  team: z.string().trim().max(200).nullable(),
});

// Who is accountable for a machine. Display data an operator maintains — it
// grants nothing and controls nothing.
export async function PUT(request: Request) {
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

  await fleet.assignOwner(parsed.data);
  await fleet.recordActivity({
    occurredAt: now,
    actorKind: "person",
    actorName: actor,
    action: parsed.data.owner ? "Assigned an owner" : "Cleared an owner",
    target: parsed.data.owner ?? parsed.data.hostId,
    result: "Saved",
    apiCall: "PUT /api/fleet/owner",
  });
  return Response.json({ ok: true });
}
