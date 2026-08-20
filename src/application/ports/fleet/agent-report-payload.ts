import { z } from "zod";
import {
  INVENTORY_ITEM_KINDS,
  INVENTORY_SCOPES,
} from "@/src/domain/fleet/entities/host";

/**
 * Wire contract for an agent check-in.
 *
 * The `inventory` object is codegate's own `InventorySummary`, accepted
 * verbatim in its native snake_case. The agent forwards what the CLI already
 * produces rather than reshaping it, so the two sides cannot drift; mapping to
 * the server's storage shape happens here, in one place.
 */

// Caps are generous enough for a densely configured developer machine while
// still bounding what a single request can cost us.
const MAX_ITEMS = 20_000;
const MAX_TOOLS = 500;
const MAX_RISK_SURFACES = 64;
const MAX_STRING = 4096;
const MAX_PATH = 4096;

const boundedString = z.string().max(MAX_STRING);

export const inventoryItemSchema = z.object({
  tool: boundedString.min(1),
  kind: z.enum(INVENTORY_ITEM_KINDS),
  type: boundedString.optional(),
  scope: z.enum(INVENTORY_SCOPES),
  pattern: boundedString.optional(),
  path: z.string().min(1).max(MAX_PATH),
  exists: z.boolean(),
  risk_surface: z.array(boundedString).max(MAX_RISK_SURFACES).default([]),
  fields_of_interest: z.record(boundedString, boundedString).optional(),
  resolved_against: boundedString.optional(),
});

export const inventorySummarySchema = z.object({
  kb_version: boundedString.optional(),
  tools: z
    .array(
      z.object({
        name: boundedString.min(1),
        version_range: boundedString.optional(),
      })
    )
    .max(MAX_TOOLS)
    .default([]),
  items: z.array(inventoryItemSchema).max(MAX_ITEMS).default([]),
});

export const agentReportPayloadSchema = z.object({
  agent: z.object({
    /** Opaque, agent-generated, stable for the life of the machine. */
    machineId: boundedString.min(1),
    version: boundedString.optional(),
  }),
  host: z.object({
    hostname: boundedString.min(1),
    platform: boundedString.optional(),
    osRelease: boundedString.optional(),
    username: boundedString.optional(),
  }),
  /** Agent-side collection time; the server records its own receipt time too. */
  collectedAt: z.string().datetime(),
  inventory: inventorySummarySchema,
});

export type AgentReportPayload = z.infer<typeof agentReportPayloadSchema>;
export type InventoryItemPayload = z.infer<typeof inventoryItemSchema>;
