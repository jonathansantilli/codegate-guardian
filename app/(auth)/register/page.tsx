import { Suspense } from "react";
import { RegisterForm } from "./register-form";
import { SetupTokenField } from "./setup-token-field";

/**
 * The form is the same either way; only whether it asks for a setup token
 * depends on a server read, so that is the only part behind a boundary.
 *
 * Wrapping the whole page instead put the form in the document twice — one
 * copy from the static shell, one from hydration, sharing input ids.
 */
export default function Page() {
  return (
    <RegisterForm
      setupTokenField={
        <Suspense fallback={null}>
          <SetupTokenField />
        </Suspense>
      }
    />
  );
}
