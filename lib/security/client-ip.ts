/**
 * Resolves the client IP from standard reverse-proxy headers.
 *
 * Self-hosted deployments sit behind nginx/Traefik/Caddy or a cloud load
 * balancer, all of which forward the originating address in one of these
 * headers. The first entry of `x-forwarded-for` is the original client; the
 * remaining entries are the proxies it traversed.
 *
 * Callers must treat the result as untrusted input: any client can forge these
 * headers unless the proxy in front of the app overwrites them. It is only
 * used for coarse rate-limit bucketing, never for authorization.
 */

const FORWARDED_FOR_HEADER = "x-forwarded-for";
const REAL_IP_HEADER = "x-real-ip";

function firstNonEmpty(value: string | null): string | undefined {
  if (!value) {
    return;
  }

  for (const candidate of value.split(",")) {
    const trimmed = candidate.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return;
}

export function getClientIp(request: Request): string | undefined {
  return (
    firstNonEmpty(request.headers.get(FORWARDED_FOR_HEADER)) ??
    firstNonEmpty(request.headers.get(REAL_IP_HEADER))
  );
}
