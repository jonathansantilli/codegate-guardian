import { type Env, loadEnv } from "./env";

// Phase 0 container stub.
//
// This is the public seam every future phase migrates toward. In Phase 0
// the container is deliberately empty — no ports, no use cases yet. Later
// phases replace this with typed port surfaces produced from zod-parsed env.
//
// HMR-safe: dev reloads call disposeContainer() so adapter handles aren't
// leaked across reloads.

export type ApplicationContainer = {
  readonly env: Env;
  readonly useCases: Readonly<Record<string, never>>;
  readonly ports: Readonly<Record<string, never>>;
  shutdown(): Promise<void>;
};

type ContainerFactory = (env: Env) => ApplicationContainer;

const defaultFactory: ContainerFactory = (env) => ({
  env,
  useCases: Object.freeze({}),
  ports: Object.freeze({}),
  shutdown: async () => {
    // Phase 0: nothing to close. Adapters will register cleanup here
    // as they land in later phases.
  },
});

let cached: ApplicationContainer | null = null;

export function buildContainer(
  env: Env = loadEnv(),
  factory: ContainerFactory = defaultFactory
): ApplicationContainer {
  return factory(env);
}

export function getContainer(): ApplicationContainer {
  if (!cached) {
    cached = buildContainer();
  }
  return cached;
}

export async function disposeContainer(): Promise<void> {
  if (!cached) return;
  const toDispose = cached;
  cached = null;
  await toDispose.shutdown();
}
