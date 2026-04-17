import type { ScanFindingRepository } from "@/src/application/ports/persistence/scan-finding-repository";
import type { ScanRunRepository } from "@/src/application/ports/persistence/scan-run-repository";

// Repositories that are safe to call inside a single atomic transaction.
// Extended as more use cases need transactional coordination; today only
// the scan-sync flow calls the UnitOfWork.
export type TransactionalRepositories = {
  scanRuns: ScanRunRepository;
  scanFindings: ScanFindingRepository;
};

export type UnitOfWork = {
  run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T>;
};
