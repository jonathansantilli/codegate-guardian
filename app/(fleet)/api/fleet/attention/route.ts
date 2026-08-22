import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { getContainer } from "@/src/infrastructure";

/**
 * Machines and the people accountable for them, worst first — one row per
 * finding per machine, because two laptops carrying the same skill are two
 * conversations with two people.
 */
export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const rows = await getContainer().ports.fleet.listAttention();

  return Response.json(
    { attention: rows },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
