import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { GuardianError } from "@/lib/errors";
import { CREDENTIAL_SURFACES } from "@/lib/security/collection-surfaces";
import { getContainer } from "@/src/infrastructure";

/**
 * The one decision that lets artifact bytes reach this server.
 *
 * Off until a person turns it on, and turning it on is an operator action with
 * their name against it — the activity row exists so that "when did this
 * console start keeping file contents, and who decided that" has an answer
 * that is not somebody's memory.
 */

const MAX_BYTES_CEILING = 1_048_576;
const MAX_ARTIFACTS_CEILING = 1000;

const updateSchema = z.object({
  collectContent: z.boolean(),
  /**
   * Refused rather than silently filtered. An operator who asks for a surface
   * this build will never upload has misunderstood something, and quietly
   * saving a narrower policy than they typed would hide that from them.
   */
  allowedRiskSurfaces: z
    .array(z.string().max(64))
    .max(64)
    .refine(
      (surfaces) => !surfaces.some((s) => CREDENTIAL_SURFACES.includes(s)),
      {
        message:
          "Surfaces that mean a file holds credentials cannot be collected: " +
          CREDENTIAL_SURFACES.join(", "),
      }
    ),
  maxBytesPerArtifact: z.number().int().positive().max(MAX_BYTES_CEILING),
  maxArtifactsPerReport: z.number().int().positive().max(MAX_ARTIFACTS_CEILING),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new GuardianError("unauthorized:fleet").toResponse();
  }

  const policy = await getContainer().ports.fleet.getCollectionPolicy();
  return Response.json(
    // What an operator may not pick, rather than a short list of what they may:
    // format decides whether a file can hold a secret, and these are the
    // surfaces that mean it does regardless of format.
    { policy, credentialSurfaces: CREDENTIAL_SURFACES },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new GuardianError("unauthorized:fleet").toResponse();
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid collection policy",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  // Collecting nothing is what an empty surface list means, so saying "on"
  // with no surfaces is a contradiction rather than a setting.
  if (
    parsed.data.collectContent &&
    parsed.data.allowedRiskSurfaces.length === 0
  ) {
    return Response.json(
      {
        error:
          "Turning collection on requires at least one allowed risk surface.",
      },
      { status: 400 }
    );
  }

  const fleet = getContainer().ports.fleet;
  const actor = session.user.email ?? session.user.id ?? "unknown";
  const now = new Date();
  const before = await fleet.getCollectionPolicy();

  const policy = await fleet.saveCollectionPolicy({
    ...parsed.data,
    updatedBy: actor,
    updatedAt: now,
  });

  await fleet.recordActivity({
    occurredAt: now,
    actorKind: "person",
    actorName: actor,
    action: policy.collectContent
      ? "Enabled artifact content collection"
      : "Disabled artifact content collection",
    target: policy.collectContent
      ? `surfaces: ${policy.allowedRiskSurfaces.join(", ")} · max ${policy.maxBytesPerArtifact} bytes`
      : `was ${before.collectContent ? "on" : "off"}`,
    result: "Saved",
    apiCall: "PUT /api/fleet/collection-policy",
  });

  return Response.json({ policy });
}
