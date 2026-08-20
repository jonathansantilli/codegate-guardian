/**
 * Determines whether a request reached the app over HTTPS.
 *
 * Auth.js picks its session-cookie name from the scheme: `https` gets the
 * `__Secure-` prefixed name, plain `http` gets the bare one. Anything reading
 * that cookie must decide the same way, or it looks for a name that was never
 * written — which, behind a plain-HTTP self-hosted deployment, turns into an
 * endless redirect to the sign-in route.
 *
 * A TLS-terminating reverse proxy forwards the original scheme in
 * `x-forwarded-proto`, so that header wins when present; otherwise the request
 * URL's own scheme decides.
 */

const FORWARDED_PROTO_HEADER = "x-forwarded-proto";
const HTTPS_SCHEME = "https";
const HTTPS_URL_PROTOCOL = "https:";

export function isSecureRequest(request: Request): boolean {
  const forwardedProto = request.headers.get(FORWARDED_PROTO_HEADER);

  if (forwardedProto) {
    // A chain of proxies appends to the header; the first entry is the scheme
    // the client actually used.
    return forwardedProto.split(",")[0].trim().toLowerCase() === HTTPS_SCHEME;
  }

  return new URL(request.url).protocol === HTTPS_URL_PROTOCOL;
}
