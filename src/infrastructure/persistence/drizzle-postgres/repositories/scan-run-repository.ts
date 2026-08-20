import { inArray } from "drizzle-orm";
import type {
  SavedScanRunHandle,
  SaveScanRunInput,
  ScanRunRepository,
} from "@/src/application/ports/persistence/scan-run-repository";
import type { ScanRun } from "@/src/domain/scan/entities/scan-run";
import type { DrizzleDb } from "@/src/infrastructure/persistence/drizzle-postgres/client";
import { scanRun } from "@/src/infrastructure/persistence/drizzle-postgres/schema";

export class DrizzleScanRunRepository implements ScanRunRepository {
  constructor(private readonly db: DrizzleDb) {}

  async findIdsByMessageIds(messageIds: string[]): Promise<string[]> {
    if (messageIds.length === 0) return [];
    const rows = await this.db
      .select({ id: scanRun.id })
      .from(scanRun)
      .where(inArray(scanRun.messageId, messageIds));
    return rows.map((row) => row.id);
  }

  async deleteByMessageIds(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    await this.db.delete(scanRun).where(inArray(scanRun.messageId, messageIds));
  }

  async saveMany(runs: SaveScanRunInput[]): Promise<SavedScanRunHandle[]> {
    if (runs.length === 0) return [];
    const inserted = await this.db.insert(scanRun).values(runs).returning({
      id: scanRun.id,
      messageId: scanRun.messageId,
      toolCallId: scanRun.toolCallId,
    });
    return inserted;
  }

  async listByMessageIds(messageIds: string[]): Promise<ScanRun[]> {
    if (messageIds.length === 0) return [];
    return (await this.db
      .select()
      .from(scanRun)
      .where(inArray(scanRun.messageId, messageIds))) as ScanRun[];
  }
}
