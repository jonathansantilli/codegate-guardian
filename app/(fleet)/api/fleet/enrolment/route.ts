import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { generateEnrolmentCode } from "@/lib/security/enrolment-code";
import { getContainer } from "@/src/infrastructure";

// Enrolment codes. maxUses above 1 is what makes an MDM rollout possible:
// one capped, expiring code shipped to a cohort rather than minted per laptop.
const MAX_USES_CAP = 5000;
const DEFAULT_TTL_HOURS = 24;

const createSchema = z.object({
  label: z.string().trim().max(200).optional(),
  maxUses: z.number().int().min(1).max(MAX_USES_CAP).default(1),
  expiresInHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(DEFAULT_TTL_HOURS),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const codes = await getContainer().ports.fleet.listEnrolmentCodes(new Date());
  return Response.json(
    { codes },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const now = new Date();
  const code = generateEnrolmentCode();

  const fleet = getContainer().ports.fleet;
  await fleet.mintEnrolmentCode({
    code,
    label: parsed.data.label,
    maxUses: parsed.data.maxUses,
    createdBy: session.user.email ?? session.user.id ?? "unknown",
    createdAt: now,
    expiresAt: new Date(now.getTime() + parsed.data.expiresInHours * 3_600_000),
  });

  // Returned once, in full. The console shows it so an operator can copy it;
  // it is not a secret worth hiding from the person who just minted it.
  await fleet.recordActivity({
    occurredAt: now,
    actorKind: "person",
    actorName: session.user.email ?? session.user.id ?? "unknown",
    action: "Minted an enrolment code",
    target: parsed.data.label ?? code,
    result: `${parsed.data.maxUses} use${parsed.data.maxUses === 1 ? "" : "s"}`,
    apiCall: "POST /api/fleet/enrolment",
  });

  return Response.json({ code }, { status: 201 });
}
