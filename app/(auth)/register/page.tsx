import { Suspense } from "react";
import { RegisterForm } from "./register-form";
import { RegisterGate } from "./register-gate";

/**
 * The form is static. The one thing on this screen that depends on a server
 * read streams into a slot inside it: the setup-token field while the instance
 * is unclaimed, the "already claimed" notice once it has an operator.
 *
 * The form itself stays out of that boundary, and that is load-bearing. React
 * client-renders a streamed boundary that is still unrevealed when a state
 * update reaches a client component inside it, instead of waiting for the
 * server HTML - and a form built from client components (the session hook,
 * the router-bound link) receives such an update within milliseconds of
 * hydration. The page then briefly holds two copies of the form, one hidden.
 * Plain markup in the slot has nothing that can update, so React waits for it
 * and hydrates it in place. Keep client components out of the slot.
 */
export default function Page() {
  return (
    <RegisterForm
      gate={
        <Suspense fallback={null}>
          <RegisterGate />
        </Suspense>
      }
    />
  );
}
