import { auth } from "@/app/(auth)/auth";
import { GuardianError } from "@/lib/errors";
import { getContainer } from "@/src/infrastructure";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new GuardianError("unauthorized:fleet").toResponse();
  }

  const hostId = new URL(request.url).searchParams.get("hostId");

  if (!hostId) {
    return new GuardianError("bad_request:api").toResponse();
  }

  const detail = await getContainer().ports.fleet.findHostDetail(hostId);

  if (!detail) {
    return Response.json({ error: "Host not found" }, { status: 404 });
  }

  return Response.json(detail, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
