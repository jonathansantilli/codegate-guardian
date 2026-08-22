import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { getContainer } from "@/src/infrastructure";

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  ruleId: z.string().trim().min(1).max(200),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]),
  enabled: z.boolean().default(true),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const policies = await getContainer().ports.fleet.listPolicies();
  return Response.json(
    { policies },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid policy" },
      { status: 400 }
    );
  }

  const actor = session.user.email ?? session.user.id ?? "unknown";
  const fleet = getContainer().ports.fleet;
  const now = new Date();

  const saved = await fleet.savePolicy({
    ...parsed.data,
    createdBy: actor,
    now,
  });

  if (saved.outcome === "name-taken") {
    return Response.json(
      { error: "A policy with that name already exists." },
      { status: 409 }
    );
  }

  await fleet.recordActivity({
    occurredAt: now,
    actorKind: "person",
    actorName: actor,
    action: parsed.data.id ? "Updated a policy" : "Created a policy",
    target: parsed.data.name,
    result: "Saved",
    apiCall: "PUT /api/fleet/policies",
  });

  return Response.json(saved, { status: parsed.data.id ? 200 : 201 });
}
