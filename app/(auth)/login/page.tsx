import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { SignUpLink } from "./sign-up-link";

/**
 * The form is static; only whether it offers sign-up depends on a server read,
 * so that is the only part behind a boundary. Same shape as /register.
 */
export default function Page() {
  return (
    <LoginForm
      signUpLink={
        <Suspense fallback={null}>
          <SignUpLink />
        </Suspense>
      }
    />
  );
}
