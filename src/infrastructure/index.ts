// Infrastructure layer entry point. Concrete adapters and framework glue.
// Everything Vercel-free: persistence, object store, LLM providers,
// telemetry, logger, auth, HTTP, middleware, composition.
//
// Only the composition root is imported from outside this layer.
export { buildContainer, getContainer, disposeContainer } from "./composition/container";
export type { ApplicationContainer } from "./composition/container";
export { loadEnv } from "./composition/env";
export type { Env } from "./composition/env";
