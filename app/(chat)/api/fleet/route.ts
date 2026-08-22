import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { getContainer } from "@/src/infrastructure";

// Fleet inventory is org-wide: machines are enrolled by an operator, not owned
// by the signed-in user, so any authenticated viewer sees every host.
export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const hosts = await getContainer().ports.fleet.listHostSummaries();

  return Response.json(
    { hosts },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
