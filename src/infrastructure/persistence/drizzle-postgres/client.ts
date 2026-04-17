import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type DrizzleDb = ReturnType<typeof drizzle>;

export type DrizzleClient = {
  readonly db: DrizzleDb;
  readonly sql: ReturnType<typeof postgres>;
  close(): Promise<void>;
};

type ClientOptions = {
  connectionUrl: string;
  maxConnections?: number;
};

export function createDrizzleClient({
  connectionUrl,
  maxConnections,
}: ClientOptions): DrizzleClient {
  const sql = postgres(
    connectionUrl,
    maxConnections ? { max: maxConnections } : undefined
  );
  const db = drizzle(sql);
  return {
    db,
    sql,
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
