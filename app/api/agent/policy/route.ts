import { extractBearerToken } from "@/lib/security/agent-token";
import { UPLOADABLE_RISK_SURFACES } from "@/lib/security/collection-surfaces";
import { hashMachineToken } from "@/lib/security/machine-token";
import { getContainer } from "@/src/infrastructure";

/**
 * What this server is willing to be sent.
 *
 * The check-in endpoint carries a deliberate comment saying this server issues
 * no instructions a machine is expected to act on, and that still holds: this
 * is a different thing. An agent asks, on its own schedule, what would be
 * accepted if it offered it — and then decides for itself, against its own
 * ceiling, what it is prepared to send. Nothing here reaches a machine, starts
 * anything, or changes anything; a machine that never calls this endpoint
 * keeps working exactly as before.
 *
 * The distinction that keeps it honest: this can only ever narrow what an
 * agent volunteers about itself. There is no field an operator could set here
 * that makes an agent run, fetch, modify or delete anything.
 *
 * Authenticated by the machine's own token, not a session — the caller is a
 * machine. An unenrolled or revoked caller learns nothing: the response is the
 * closed default, which is also what an unconfigured server says.
 */

/** What a caller we cannot place is told: send nothing. */
const CLOSED = {
  collect_content: false,
  allowed_risk_surfaces: [] as string[],
  max_bytes_per_artifact: 0,
  max_artifacts_per_report: 0,
} as const;

const NO_STORE = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

export async function GET(request: Request) {
  const token = extractBearerToken(request.headers.get("authorization"));
  const container = getContainer();

  const reporting = token
    ? await container.ports.fleet.findHostByTokenHash(hashMachineToken(token))
    : null;

  // Deliberately 200 rather than 401. This endpoint reveals nothing worth
  // guarding, and an agent that cannot be placed should quietly send nothing
  // rather than treat a policy read as a fatal error and abandon a check-in it
  // is still perfectly entitled to make.
  if (!reporting || reporting.revokedAt) {
    return Response.json(CLOSED, { headers: NO_STORE });
  }

  const policy = await container.ports.fleet.getCollectionPolicy();

  // The stored policy is an operator's intent; this list is the product's
  // limit. Publishing the intersection means an operator cannot advertise a
  // surface the server would refuse to store anyway.
  const allowed = policy.allowedRiskSurfaces.filter((surface) =>
    UPLOADABLE_RISK_SURFACES.includes(surface)
  );

  return Response.json(
    {
      collect_content: policy.collectContent && allowed.length > 0,
      allowed_risk_surfaces: allowed,
      max_bytes_per_artifact: policy.maxBytesPerArtifact,
      max_artifacts_per_report: policy.maxArtifactsPerReport,
    },
    { headers: NO_STORE }
  );
}
