import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { getContainer } from "@/src/infrastructure";

const bodySchema = z.object({
  hostId: z.string().uuid(),
  owner: z.string().trim().max(200).nullable(),
  team: z.string().trim().max(200).nullable(),
});

// Who is accountable for a machine. Display data an operator maintains — it
// grants nothing and controls nothing.
export async function PUT(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  await getContainer().ports.fleet.assignOwner(parsed.data);
  return Response.json({ ok: true });
}
