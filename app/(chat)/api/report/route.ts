import { auth } from "@/app/(auth)/auth";
import { getReportingOverviewByUserId } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { isHackathonModeEnabled } from "@/lib/security/hackathon-mode";

export async function GET() {
  const hackathonModeEnabled = isHackathonModeEnabled();
  const session = await auth();

  if (!session?.user && !hackathonModeEnabled) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const overview = await getReportingOverviewByUserId({
    userId: hackathonModeEnabled ? null : session?.user?.id,
  });

  return Response.json(overview);
}
