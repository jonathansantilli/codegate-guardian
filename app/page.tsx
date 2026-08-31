import { redirect } from "next/navigation";

/**
 * The console is the whole of this deployment.
 *
 * The page that describes the product lives in codegate-guardian-site now, so
 * this server has nothing to serve at "/" but the console behind it. An
 * unauthenticated visitor never reaches here — the proxy sends them to sign in.
 */
export default function Page() {
  redirect("/fleet");
}
