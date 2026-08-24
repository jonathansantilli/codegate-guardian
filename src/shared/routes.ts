// Route paths shared between the composition root and the request proxy.
//
// Kept in a dependency-free leaf module: the proxy runs as middleware, so
// anything it imports is pulled into that bundle. Importing this constant from
// the infrastructure barrel would drag the database client in with it.

/** Prefix for machine-authenticated agent endpoints (bearer token, no session). */
export const AGENT_ROUTE_PREFIX = "/api/agent";
