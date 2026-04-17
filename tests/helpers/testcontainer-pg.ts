import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import postgres from "postgres";

// Integration-test harness: boots a Postgres 16 container, applies every
// Drizzle migration, and returns a connected client + helpers. Convention
// for tests under tests/integration/: one container per test file via
// beforeAll/afterAll. Reset state between tests via resetDatabase().
//
// The migration path stays `lib/db/migrations` until Phase 3a moves it to
// `src/infrastructure/persistence/drizzle-postgres/migrations`.

const MIGRATIONS_FOLDER = "./lib/db/migrations";
const DEFAULT_IMAGE = "postgres:16-alpine";

export type PostgresHarness = {
  readonly container: StartedPostgreSqlContainer;
  readonly connectionUrl: string;
  readonly db: ReturnType<typeof drizzle>;
  readonly client: ReturnType<typeof postgres>;
  resetDatabase(): Promise<void>;
  stop(): Promise<void>;
};

export async function startPostgresHarness(
  image: string = DEFAULT_IMAGE
): Promise<PostgresHarness> {
  const container = await new PostgreSqlContainer(image)
    .withDatabase("codegate_test")
    .withUsername("postgres")
    .withPassword("postgres")
    .start();

  const connectionUrl = container.getConnectionUri();
  const client = postgres(connectionUrl, { max: 1 });
  const db = drizzle(client);

  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  const resetDatabase = async () => {
    // Truncate every user-owned table in the public schema. Avoids
    // re-running migrations between tests — much cheaper.
    const rows = await client<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
        AND tablename <> '__drizzle_migrations'
    `;
    if (rows.length === 0) return;
    const tables = rows.map((row) => `"${row.tablename}"`).join(", ");
    await client.unsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  };

  const stop = async () => {
    await client.end({ timeout: 5 });
    await container.stop();
  };

  return { container, connectionUrl, db, client, resetDatabase, stop };
}
