import type { FleetRepository } from "@/src/application/ports/fleet/fleet-repository";
import {
  createDrizzleClient,
  type DrizzleClient,
} from "../persistence/drizzle-postgres/client";
import { DrizzleFleetRepository } from "../persistence/drizzle-postgres/repositories/fleet-repository";
import { type Env, loadEnv } from "./env";

// Composition root.
//
// This is the public seam every route resolves adapters through: nothing
// outside this layer chooses a driver or reads adapter configuration.
//
// HMR-safe: dev reloads call disposeContainer() so adapter handles aren't
// leaked across reloads.

export type ApplicationPorts = {
  readonly fleet: FleetRepository;
};

export type ApplicationContainer = {
  readonly env: Env;
  readonly useCases: Readonly<Record<string, never>>;
  readonly ports: ApplicationPorts;
  shutdown(): Promise<void>;
};

type ContainerFactory = (env: Env) => ApplicationContainer;

const defaultFactory: ContainerFactory = (env) => {
  // postgres-js opens no socket until the first query, so building the client
  // here costs nothing; closing it on shutdown keeps dev HMR from leaking a
  // pool per reload.
  const dbClient: DrizzleClient = createDrizzleClient({
    connectionUrl: env.POSTGRES_URL,
  });

  return {
    env,
    useCases: Object.freeze({}),
    ports: Object.freeze({
      fleet: new DrizzleFleetRepository(dbClient.db),
    }),
    shutdown: async () => {
      await dbClient.close();
    },
  };
};

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
  if (!cached) {
    return;
  }
  const toDispose = cached;
  cached = null;
  await toDispose.shutdown();
}
