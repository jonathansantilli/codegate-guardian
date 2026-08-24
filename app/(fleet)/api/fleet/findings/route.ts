import { auth } from "@/app/(auth)/auth";
import { GuardianError } from "@/lib/errors";
import { getContainer } from "@/src/infrastructure";

// Findings across the fleet. Status is derived from report history, so this is
// a read of what the machines last said — never a record of anyone's opinion.
export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new GuardianError("unauthorized:fleet").toResponse();
  }

  const findings = await getContainer().ports.fleet.listFindings();

  return Response.json(
    { findings },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
