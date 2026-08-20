// Infrastructure layer entry point. Concrete adapters and framework glue.
// Everything Vercel-free: persistence, object store, LLM providers,
// telemetry, logger, auth, HTTP, middleware, composition.
//
// Only the composition root is imported from outside this layer.

export type {
  ApplicationContainer,
  ApplicationPorts,
} from "./composition/container";
export {
  buildContainer,
  disposeContainer,
  getContainer,
} from "./composition/container";
export type { Env } from "./composition/env";
export { loadEnv } from "./composition/env";
