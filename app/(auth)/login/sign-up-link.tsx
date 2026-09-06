import { hasAnyUser } from "@/lib/db/queries";

/**
 * "No account? Sign up", offered only while there is something to sign up to.
 * This version has exactly one operator; once the instance is claimed the link
 * led to a form that could only refuse.
 *
 * A plain anchor, not next/link: this streams into a boundary, and a client
 * component in a still-unrevealed boundary makes React client-render it (see
 * register/page.tsx). Both screens are full page loads anyway.
 */
export async function SignUpLink() {
  if (await hasAnyUser()) {
    return null;
  }

  return (
    <p className="text-center text-[13px] text-muted-foreground">
      {"No account? "}
      <a
        className="text-foreground underline-offset-4 hover:underline"
        href="/register"
      >
        Claim this instance
      </a>
    </p>
  );
}
