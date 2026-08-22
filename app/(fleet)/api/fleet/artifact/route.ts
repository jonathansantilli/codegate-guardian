import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { getContainer } from "@/src/infrastructure";

/** One artifact variant: which machines carry this exact file. */
export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const contentHash = new URL(request.url).searchParams.get("contentHash");

  if (!contentHash) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const variant =
    await getContainer().ports.fleet.findArtifactVariant(contentHash);

  if (!variant) {
    return Response.json({ error: "Artifact not found" }, { status: 404 });
  }

  return Response.json(variant, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
