import Link from "next/link";
import { hasAnyUser } from "@/lib/db/queries";

/**
 * "No account? Sign up" — offered only while there is nothing to sign up to
 * is not true of. This version has exactly one operator; once the instance is
 * claimed the link led to a form that could only refuse.
 */
export async function SignUpLink() {
  if (await hasAnyUser()) {
    return null;
  }

  return (
    <p className="text-center text-[13px] text-muted-foreground">
      {"No account? "}
      <Link
        className="text-foreground underline-offset-4 hover:underline"
        href="/register"
      >
        Claim this instance
      </Link>
    </p>
  );
}
