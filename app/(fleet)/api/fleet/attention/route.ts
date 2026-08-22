import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { getContainer } from "@/src/infrastructure";

/**
 * Machines and the people accountable for them, worst first — one row per
 * finding per machine, because two laptops carrying the same skill are two
 * conversations with two people.
 */
export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  // Uncapped when the caller asks about one finding: the findings screen
  // lists the machines carrying it, and a capped answer told an operator a
  // finding was on three machines and then that it was on none.
  const fingerprint = new URL(request.url).searchParams.get("fingerprint");
  const rows = await getContainer().ports.fleet.listAttention(
    fingerprint ? Number.MAX_SAFE_INTEGER : undefined
  );

  if (fingerprint) {
    return Response.json(
      { attention: rows.filter((row) => row.fingerprint === fingerprint) },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  return Response.json(
    { attention: rows },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
