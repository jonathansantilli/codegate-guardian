import { auth } from "@/app/(auth)/auth";
import { GuardianError } from "@/lib/errors";
import { getContainer } from "@/src/infrastructure";

// Artifacts across the fleet, grouped by content hash. Two files sharing a
// name but differing by one byte are two variants here, never one row.
export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new GuardianError("unauthorized:fleet").toResponse();
  }

  const artifacts = await getContainer().ports.fleet.listArtifactGroups();

  return Response.json(
    { artifacts },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
