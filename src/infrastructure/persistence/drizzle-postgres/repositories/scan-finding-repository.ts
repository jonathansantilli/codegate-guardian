import { inArray } from "drizzle-orm";
import type {
  SaveScanFindingInput,
  ScanFindingRepository,
} from "@/src/application/ports/persistence/scan-finding-repository";
import type { ScanFinding } from "@/src/domain/scan/entities/scan-finding";
import type { DrizzleDb } from "@/src/infrastructure/persistence/drizzle-postgres/client";
import { scanFinding } from "@/src/infrastructure/persistence/drizzle-postgres/schema";

export class DrizzleScanFindingRepository implements ScanFindingRepository {
  constructor(private readonly db: DrizzleDb) {}

  async deleteByScanRunIds(scanRunIds: string[]): Promise<void> {
    if (scanRunIds.length === 0) return;
    await this.db
      .delete(scanFinding)
      .where(inArray(scanFinding.scanRunId, scanRunIds));
  }

  async saveMany(findings: SaveScanFindingInput[]): Promise<void> {
    if (findings.length === 0) return;
    await this.db.insert(scanFinding).values(findings);
  }

  async listByScanRunIds(scanRunIds: string[]): Promise<ScanFinding[]> {
    if (scanRunIds.length === 0) return [];
    return (await this.db
      .select()
      .from(scanFinding)
      .where(inArray(scanFinding.scanRunId, scanRunIds))) as ScanFinding[];
  }
}
