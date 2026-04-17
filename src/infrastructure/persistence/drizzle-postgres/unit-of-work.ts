import type {
  TransactionalRepositories,
  UnitOfWork,
} from "@/src/application/ports/persistence/unit-of-work";
import type { DrizzleDb } from "@/src/infrastructure/persistence/drizzle-postgres/client";
import { DrizzleScanFindingRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/scan-finding-repository";
import { DrizzleScanRunRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/scan-run-repository";

export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private readonly db: DrizzleDb) {}

  async run<T>(
    work: (repos: TransactionalRepositories) => Promise<T>
  ): Promise<T> {
    return await this.db.transaction(async (tx) => {
      // Drizzle's transaction handle shares the same query surface as the
      // base `db` object, so the adapters are safe to instantiate with
      // `tx` as the DrizzleDb dependency.
      const repos: TransactionalRepositories = {
        scanRuns: new DrizzleScanRunRepository(tx as unknown as DrizzleDb),
        scanFindings: new DrizzleScanFindingRepository(
          tx as unknown as DrizzleDb
        ),
      };
      return await work(repos);
    });
  }
}
