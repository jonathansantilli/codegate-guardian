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

  // Absolute base URL this instance is reached at. Used for page metadata.
  APP_URL: stringWithDefault("http://localhost:3000"),

  // Demo / basePath behavior
  IS_DEMO: booleanFromString.default(false),
  NEXT_PUBLIC_BASE_PATH: z.string().default(""),

  // Fleet ingest: shared bearer token every agent presents when reporting.
  // Absent means the ingest endpoint is closed, so an instance that has not
  // opted in cannot be written to by an unauthenticated agent.
  AGENT_INGEST_TOKEN: optionalNonEmpty,
  /**
   * Claims an unclaimed instance.
   *
   * Registration on a fresh install has to let somebody in to become the
   * first operator, and until they do, "reach the port" is the whole of
   * authentication. Requiring a token the operator set before starting the
   * container means the window is only open to whoever deployed it.
   *
   * Unset means an unclaimed instance cannot be claimed — fail closed, since
   * the alternative is an open door on a fleet security console.
   */
  SETUP_TOKEN: optionalNonEmpty,
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
