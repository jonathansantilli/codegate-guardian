import { z } from "zod";

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === "boolean") return value;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  });

const optionalNonEmpty = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length > 0, { message: "must be non-empty" })
  .optional();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Required core
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  POSTGRES_URL: z.string().min(1, "POSTGRES_URL is required"),

  // Optional core
  REDIS_URL: optionalNonEmpty,

  // Demo / basePath behavior (A4 acceptance)
  IS_DEMO: booleanFromString.default(false),
  NEXT_PUBLIC_BASE_PATH: z.string().default(""),

  // Feature flags
  HACKATHON_MODE: booleanFromString.default(false),
  ENABLE_LOCAL_CLI_MODELS: booleanFromString.default(false),
  LOCAL_CLI_MODELS: optionalNonEmpty,
  LOCAL_CLI_MODELS_CONFIG: optionalNonEmpty,

  // Direct provider keys
  GOOGLE_GENERATIVE_AI_API_KEY: optionalNonEmpty,
  GEMINI_API_KEY: optionalNonEmpty,

  // Legacy Vercel-era variables (kept readable through the transition
  // and removed in the phase that decommissions the matching adapter).
  AI_GATEWAY_API_KEY: optionalNonEmpty, // removed in Phase 4
  BLOB_READ_WRITE_TOKEN: optionalNonEmpty, // removed in Phase 6

  // Telemetry
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalNonEmpty,

  // Scanner CLI
  CODEX_BIN: optionalNonEmpty,
  CODEGATE_HOME: optionalNonEmpty,

  // Adapter selection (defaults chosen in each port's implementation
  // phase; surfaced here so the env contract is visible now).
  OBJECT_STORE_DRIVER: z.enum(["s3", "filesystem"]).default("s3"),
  BOT_DETECTION_DRIVER: z.enum(["noop"]).default("noop"),
  RATE_LIMITER_DRIVER: z.enum(["redis", "in-memory"]).default("redis"),
  TELEMETRY_DRIVER: z.enum(["otlp", "noop"]).default("noop"),
  LOGGER_DRIVER: z.enum(["console", "otel"]).default("console"),

  // S3 / MinIO configuration (consumed in Phase 6)
  S3_ENDPOINT: optionalNonEmpty,
  S3_REGION: optionalNonEmpty,
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
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
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
