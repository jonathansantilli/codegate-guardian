import {
  type ApplicationContainer,
  buildContainer,
} from "@/src/infrastructure/composition/container";
import type { Env } from "@/src/infrastructure/composition/env";

// Test helper for use-case unit tests. Gives back a container built from a
// fully-specified test env — filesystem object store, no external services —
// so a test never depends on the ambient environment.

const defaultEnv: Env = {
  NODE_ENV: "test",
  AUTH_SECRET: "test-secret-test-secret-test-secret-test",
  POSTGRES_URL: "postgres://test:test@localhost:5432/test",
  REDIS_URL: undefined,
  APP_URL: "http://localhost:3000",
  IS_DEMO: false,
  NEXT_PUBLIC_BASE_PATH: "",
  HACKATHON_MODE: false,
  ENABLE_LOCAL_CLI_MODELS: false,
  LOCAL_CLI_MODELS: undefined,
  LOCAL_CLI_MODELS_CONFIG: undefined,
  GOOGLE_GENERATIVE_AI_API_KEY: undefined,
  GEMINI_API_KEY: undefined,
  OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
  CODEX_BIN: undefined,
  CODEGATE_HOME: undefined,
  OBJECT_STORE_DRIVER: "filesystem",
  BOT_DETECTION_DRIVER: "noop",
  RATE_LIMITER_DRIVER: "in-memory",
  TELEMETRY_DRIVER: "noop",
  LOGGER_DRIVER: "console",
  OBJECT_STORE_PATH: "./data/uploads",
  S3_ENDPOINT: undefined,
  S3_REGION: "us-east-1",
  S3_BUCKET: undefined,
  S3_ACCESS_KEY_ID: undefined,
  S3_SECRET_ACCESS_KEY: undefined,
  S3_PUBLIC_URL_BASE: undefined,
  S3_FORCE_PATH_STYLE: false,
};

export type FakeContainerOverrides = {
  env?: Partial<Env>;
};

export function buildFakeContainer(
  overrides: FakeContainerOverrides = {}
): ApplicationContainer {
  const env: Env = { ...defaultEnv, ...(overrides.env ?? {}) };
  return buildContainer(env);
}
