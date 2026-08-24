import { auth } from "@/app/(auth)/auth";
import { GuardianError } from "@/lib/errors";
import { getContainer } from "@/src/infrastructure";

/** The overview's headline numbers, counted server-side in one round trip. */
export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new GuardianError("unauthorized:fleet").toResponse();
  }

  const overview = await getContainer().ports.fleet.overview(new Date());

  return Response.json(overview, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
