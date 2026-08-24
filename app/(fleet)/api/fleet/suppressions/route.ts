import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { GuardianError } from "@/lib/errors";
import { getContainer } from "@/src/infrastructure";

const createSchema = z
  .object({
    scope: z.enum(["fleet", "machine"]),
    hostId: z.string().uuid().optional(),
    fingerprint: z.string().max(200).optional(),
    ruleId: z.string().max(200).optional(),
    // Required, and deliberately so: a silence nobody explained is one nobody
    // can review later.
    reason: z.string().trim().min(1).max(2000),
    expiresAt: z.string().datetime().optional(),
  })
  .refine((body) => body.fingerprint || body.ruleId, {
    message: "A suppression must name a fingerprint or a rule.",
  })
  .refine((body) => body.scope !== "machine" || body.hostId, {
    message: "A machine-scoped suppression must name a machine.",
  });

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new GuardianError("unauthorized:fleet").toResponse();
  }

  const suppressions = await getContainer().ports.fleet.listSuppressions();
  return Response.json(
    { suppressions },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new GuardianError("unauthorized:fleet").toResponse();
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid suppression" },
      { status: 400 }
    );
  }

  const actor = session.user.email ?? session.user.id ?? "unknown";
  const fleet = getContainer().ports.fleet;
  const now = new Date();

  const created = await fleet.suppressFinding({
    ...parsed.data,
    createdBy: session.user.email ?? session.user.id ?? "unknown",
    createdAt: new Date(),
    expiresAt: parsed.data.expiresAt
      ? new Date(parsed.data.expiresAt)
      : undefined,
  });

  await fleet.recordActivity({
    occurredAt: now,
    actorKind: "person",
    actorName: actor,
    action: `Suppressed a finding (${parsed.data.scope})`,
    target: parsed.data.fingerprint ?? parsed.data.ruleId ?? null,
    result: parsed.data.reason,
    apiCall: "POST /api/fleet/suppressions",
  });

  return Response.json(created, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new GuardianError("unauthorized:fleet").toResponse();
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return new GuardianError("bad_request:api").toResponse();
  }

  const actor = session.user.email ?? session.user.id ?? "unknown";
  const fleet = getContainer().ports.fleet;
  const now = new Date();

  await fleet.revokeSuppression({
    id,
    revokedAt: new Date(),
  });
  await fleet.recordActivity({
    occurredAt: now,
    actorKind: "person",
    actorName: actor,
    action: "Revoked a suppression",
    target: id,
    result: "Revoked",
    apiCall: "DELETE /api/fleet/suppressions",
  });
  return Response.json({ ok: true });
}
