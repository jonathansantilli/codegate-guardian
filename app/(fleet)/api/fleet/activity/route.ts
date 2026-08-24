import { auth } from "@/app/(auth)/auth";
import { GuardianError } from "@/lib/errors";
import { getContainer } from "@/src/infrastructure";

const MAX_ROWS = 200;

// What happened on this server. Never what happened to a machine — nothing
// here reaches one.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new GuardianError("unauthorized:fleet").toResponse();
  }

  const requested = Number(
    new URL(request.url).searchParams.get("limit") ?? 100
  );
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(1, requested), MAX_ROWS)
    : 100;

  const activity = await getContainer().ports.fleet.listActivity(limit);
  return Response.json(
    { activity },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
