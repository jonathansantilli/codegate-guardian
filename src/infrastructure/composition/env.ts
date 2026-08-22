import { z } from "zod";

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === "boolean") return value;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  });

// An env var set to an empty string means "not configured" everywhere it
// matters — `docker compose` writes `${VAR:-}` as "", Kubernetes does the same
// for an absent secret key, and `VAR=` in a .env file is indistinguishable from
// omitting the line. Treat all of those as undefined rather than as an error.
const optionalNonEmpty = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

// Same rule for variables that carry a default: an empty value falls back to
// the default instead of overriding it with "".
function stringWithDefault(fallback: string) {
  return z
    .string()
    .transform((value) => value.trim())
    .transform((value) => (value.length > 0 ? value : fallback))
    .default(fallback);
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Required core
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  POSTGRES_URL: z.string().min(1, "POSTGRES_URL is required"),

  // Optional core
  REDIS_URL: optionalNonEmpty,

  // Absolute base URL this instance is reached at. Used for page metadata and
  // for building fetchable URLs for locally stored uploads.
  APP_URL: stringWithDefault("http://localhost:3000"),

  // Demo / basePath behavior (A4 acceptance)
  IS_DEMO: booleanFromString.default(false),
  NEXT_PUBLIC_BASE_PATH: z.string().default(""),

  // Feature flags

  // Direct provider keys

  // Fleet ingest: shared bearer token every agent presents when reporting.
  // Absent means the ingest endpoint is closed, so an instance that has not
  // opted in cannot be written to by an unauthenticated agent.
  AGENT_INGEST_TOKEN: optionalNonEmpty,

  // Telemetry
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalNonEmpty,

  // Scanner CLI
  CODEGATE_HOME: optionalNonEmpty,

  // Adapter selection (defaults chosen in each port's implementation
  // phase; surfaced here so the env contract is visible now).
  // Filesystem is the default so a bare `next start` needs no extra services;
  // the compose stack opts into MinIO by setting this to "s3".
  OBJECT_STORE_DRIVER: z.enum(["s3", "filesystem"]).default("filesystem"),

  // Filesystem object store
  OBJECT_STORE_PATH: stringWithDefault("./data/uploads"),

  // S3 / MinIO configuration (required when OBJECT_STORE_DRIVER=s3)
  S3_ENDPOINT: optionalNonEmpty,
  S3_REGION: stringWithDefault("us-east-1"),
  S3_BUCKET: optionalNonEmpty,
  S3_ACCESS_KEY_ID: optionalNonEmpty,
  S3_SECRET_ACCESS_KEY: optionalNonEmpty,
  S3_PUBLIC_URL_BASE: optionalNonEmpty,
  S3_FORCE_PATH_STYLE: booleanFromString.default(false),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    const summary = issues
      .map(
        (issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`
      )
      .join("\n");
    super(`Environment validation failed:\n${summary}`);
    this.name = "EnvValidationError";
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new EnvValidationError(parsed.error.issues);
  }
  return parsed.data;
}
