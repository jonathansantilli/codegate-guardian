import { Suspense } from "react";
import { RegisterGate } from "./register-gate";

/**
 * Whether this screen is a claim form or a "already claimed" notice depends
 * on a server read, so the whole screen sits behind one boundary. The fallback
 * is empty on purpose: a fallback that drew the form put two copies in the
 * document — one from the static shell, one from hydration — sharing ids.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <RegisterGate />
    </Suspense>
  );
}
