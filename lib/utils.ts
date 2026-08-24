import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { GuardianError, type ErrorCode } from "./errors";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * The fetcher every SWR call in the console uses.
 *
 * Not every error body is one of ours. The proxy answers an unauthenticated
 * API call with `{"error":"Unauthorized"}` and no code — which is exactly what
 * a console left open past its session gets — and a proxy or a crash can
 * answer with no JSON at all. Reading `code` off those and splitting it threw
 * a TypeError, which SWR reports as a failure with no recognisable shape, so
 * the panel sat on its loading state forever instead of saying anything.
 */
export const fetcher = async (url: string) => {
  const response = await fetch(url);

  if (response.ok) {
    return response.json();
  }

  const body = await response.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : null;
  const cause = typeof body?.cause === "string" ? body.cause : undefined;

  if (code?.includes(":")) {
    throw new GuardianError(code as ErrorCode, cause);
  }

  // No code we recognise: derive one from the status, so callers can still
  // tell "signed out" from "broken" rather than seeing an opaque TypeError.
  // A 5xx is not the caller's fault, so it must not be reported as one —
  // "please check your input" on a crashed route or a proxy 502 sends the
  // operator looking in the wrong place.
  if (response.status >= 500) {
    throw new GuardianError("offline:fleet", cause);
  }

  throw new GuardianError(
    response.status === 401
      ? "unauthorized:fleet"
      : response.status === 403
        ? "forbidden:fleet"
        : response.status === 404
          ? "not_found:fleet"
          : "bad_request:api",
    cause
  );
};
