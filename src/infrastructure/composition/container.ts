import type { ObjectStore } from "@/src/application/ports/storage/object-store";
import { UPLOADS_ROUTE_PATH } from "@/src/shared/routes";
import { createFilesystemObjectStore } from "../storage/filesystem-object-store";
import { createS3ObjectStore } from "../storage/s3-object-store";
import { type Env, loadEnv } from "./env";

// Composition root.
//
// This is the public seam every route resolves adapters through: nothing
// outside this layer chooses a driver or reads adapter configuration.
//
// HMR-safe: dev reloads call disposeContainer() so adapter handles aren't
// leaked across reloads.

export type ApplicationPorts = {
  readonly objectStore: ObjectStore;
};

export type ApplicationContainer = {
  readonly env: Env;
  readonly useCases: Readonly<Record<string, never>>;
  readonly ports: ApplicationPorts;
  shutdown(): Promise<void>;
};

type ContainerFactory = (env: Env) => ApplicationContainer;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `${name} is required when OBJECT_STORE_DRIVER=s3. Set it, or switch to OBJECT_STORE_DRIVER=filesystem.`
    );
  }
  return value;
}

function buildObjectStore(env: Env): {
  objectStore: ObjectStore;
  shutdown: () => void;
} {
  if (env.OBJECT_STORE_DRIVER === "s3") {
    const store = createS3ObjectStore({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: requireEnv(env.S3_BUCKET, "S3_BUCKET"),
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      publicUrlBase: requireEnv(env.S3_PUBLIC_URL_BASE, "S3_PUBLIC_URL_BASE"),
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });

    return { objectStore: store, shutdown: () => store.destroy() };
  }

  const appUrl = env.APP_URL.replace(/\/+$/, "");

  return {
    objectStore: createFilesystemObjectStore({
      rootDir: env.OBJECT_STORE_PATH,
      publicUrlBase: `${appUrl}${env.NEXT_PUBLIC_BASE_PATH}${UPLOADS_ROUTE_PATH}`,
    }),
    shutdown: () => {
      // Nothing to release: the filesystem adapter holds no handles.
    },
  };
}

const defaultFactory: ContainerFactory = (env) => {
  const { objectStore, shutdown: shutdownObjectStore } = buildObjectStore(env);

  return {
    env,
    useCases: Object.freeze({}),
    ports: Object.freeze({ objectStore }),
    shutdown: () => {
      shutdownObjectStore();
      return Promise.resolve();
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
