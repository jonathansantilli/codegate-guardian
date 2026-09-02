import Link from "next/link";
import { hasAnyUser } from "@/lib/db/queries";
import { RegisterForm } from "./register-form";
import { SetupTokenField } from "./setup-token-field";

/**
 * One instance, one operator. Once it is claimed there is nothing here to
 * fill in, and a form that can only refuse is worse than saying so.
 */
export async function RegisterGate() {
  if (await hasAnyUser()) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">
          This console has its operator
        </h1>
        <p className="text-sm text-muted-foreground">
          This version has exactly one, and the instance has been claimed. If
          that is you, sign in.
        </p>
        <Link
          className="text-[13px] text-foreground underline-offset-4 hover:underline"
          href="/login"
        >
          Sign in
        </Link>
      </>
    );
  }

  return <RegisterForm setupTokenField={<SetupTokenField />} />;
}
