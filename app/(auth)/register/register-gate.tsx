import { hasAnyUser } from "@/lib/db/queries";
import { SetupTokenField } from "./setup-token-field";

/**
 * One instance, one operator. Once it is claimed there is nothing here to
 * fill in, and a form that can only refuse is worse than saying so.
 *
 * Renders into the slot inside the claim form. On an unclaimed instance that
 * is the setup-token field; on a claimed one it is this notice, and the form
 * around it steps aside through the `.claim-screen` rule in globals.css. The
 * notice is plain markup on purpose: nothing in this slot may be a client
 * component (see register/page.tsx), so the link is an anchor, not next/link.
 */
export async function RegisterGate() {
  if (await hasAnyUser()) {
    return (
      <div className="flex flex-col gap-2" data-claimed="">
        <h1 className="text-2xl font-semibold tracking-tight">
          This console has its operator
        </h1>
        <p className="text-sm text-muted-foreground">
          This version has exactly one, and the instance has been claimed. If
          that is you, sign in.
        </p>
        <a
          className="text-[13px] text-foreground underline-offset-4 hover:underline"
          href="/login"
        >
          Sign in
        </a>
      </div>
    );
  }

  return <SetupTokenField />;
}
