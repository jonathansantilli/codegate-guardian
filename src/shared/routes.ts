// Route paths shared between the composition root and the request proxy.
//
// Kept in a dependency-free leaf module: the proxy runs as middleware, so
// anything it imports is pulled into that bundle. Importing this constant
// from the infrastructure barrel would drag the object-store adapters, and
// with them the AWS SDK, into middleware.

/** Mount point of the route that serves locally stored uploads. */
export const UPLOADS_ROUTE_PATH = "/api/uploads";

/** Prefix for machine-authenticated agent endpoints (bearer token, no session). */
export const AGENT_ROUTE_PREFIX = "/api/agent";
