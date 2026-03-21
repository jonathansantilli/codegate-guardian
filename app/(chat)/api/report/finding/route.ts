import { auth } from "@/app/(auth)/auth";
import { getReportingFindingDetailById } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { isHackathonModeEnabled } from "@/lib/security/hackathon-mode";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter id is required."
    ).toResponse();
  }

  const hackathonModeEnabled = isHackathonModeEnabled();
  const session = await auth();

  if (!session?.user && !hackathonModeEnabled) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const finding = await getReportingFindingDetailById({
    id,
    userId: hackathonModeEnabled ? null : session?.user?.id,
  });

  if (!finding) {
    return new ChatbotError(
      "not_found:database",
      "Reporting finding not found"
    ).toResponse();
  }

  return Response.json(finding);
}
