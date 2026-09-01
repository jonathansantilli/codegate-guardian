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
// "sha256:" + 64 hex, matching the content feed's indicator format.
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

const boundedString = z.string().max(MAX_STRING);

export const inventoryItemSchema = z.object({
  tool: boundedString.min(1),
  kind: z.enum(INVENTORY_ITEM_KINDS),
  type: boundedString.optional(),
  scope: z.enum(INVENTORY_SCOPES),
  pattern: boundedString.optional(),
  path: z.string().min(1).max(MAX_PATH),
  exists: z.boolean(),
  // Identity. Absent when the file does not exist, or when an older agent
  // predates hashing — the server keeps such rows but cannot group them.
  sha256: z.string().regex(CONTENT_HASH).optional(),
  risk_surface: z.array(boundedString).max(MAX_RISK_SURFACES).default([]),
  /**
   * How the file is written, as the agent's knowledge base describes it.
   * Optional because agents predating it send nothing, and its absence has to
   * read as "unknown" — which the upload check treats as "refuse".
   */
  format: boundedString.optional(),
  fields_of_interest: z.record(boundedString, boundedString).optional(),
  resolved_against: boundedString.optional(),
});

export const SEVERITIES = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
] as const;
const MAX_FINDINGS = 5000;
/**
 * Hard ceilings on offered content, independent of the collection policy.
 *
 * The policy is an operator's setting and can be edited; these bound what the
 * endpoint will parse at all, so a mis-set policy cannot turn a check-in into
 * an unbounded upload. The 8 MiB body cap still sits above both.
 */
const MAX_CONTENT_BYTES = 1_048_576;
const MAX_CONTENTS = 1000;

/**
 * A finding as the codegate scanner emits it, narrowed to what the console
 * shows. The raw finding rides along untouched so the server never has to
 * guess at a field it does not yet display.
 */
export const findingSchema = z.object({
  finding_id: boundedString.min(1),
  rule_id: boundedString.min(1),
  fingerprint: boundedString.optional(),
  severity: z.enum(SEVERITIES),
  category: boundedString.optional(),
  layer: boundedString.optional(),
  file_path: z.string().max(MAX_PATH).optional(),
  /** Hash of the file the finding sits on, tying it to an artifact variant. */
  sha256: z.string().regex(CONTENT_HASH).optional(),
  line: z.number().int().nonnegative().optional(),
  column: z.number().int().nonnegative().optional(),
  description: boundedString,
  evidence: boundedString.optional(),
  owasp: z.array(boundedString).max(32).default([]),
  cwe: boundedString.optional(),
  confidence: boundedString.optional(),
  fixable: z.boolean().optional(),
  suppressed: z.boolean().optional(),
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

/**
 * Artifact bytes, offered only when the server's collection policy asks for
 * them. The entry names a hash and carries text, and nothing else: what the
 * artifact IS — its risk surfaces, which tool it belongs to — is read from the
 * inventory item in this same report that carries the same hash.
 *
 * That is on purpose. A separate risk-surface field here would be a second
 * claim about the same artifact, and the server would have to decide which to
 * believe. Correlating instead means an agent cannot dress a settings file up
 * as a rules file without also lying in its inventory, where the same lie is
 * visible on the machine's own page.
 */
export const artifactContentSchema = z.object({
  sha256: z.string().regex(CONTENT_HASH),
  content: z.string().max(MAX_CONTENT_BYTES),
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
  /**
   * What the scanner found on this machine. Absent when the agent reported
   * inventory only — which is not the same as "nothing was found", so the
   * server must not treat a missing list as a clean machine.
   */
  findings: z.array(findingSchema).max(MAX_FINDINGS).optional(),
  /**
   * Present only when this server's policy asked for content. Absent is the
   * normal case and always will be for an agent that never enabled it.
   */
  contents: z.array(artifactContentSchema).max(MAX_CONTENTS).optional(),
});

export type AgentReportPayload = z.infer<typeof agentReportPayloadSchema>;
export type InventoryItemPayload = z.infer<typeof inventoryItemSchema>;
export type FindingPayload = z.infer<typeof findingSchema>;
export type ArtifactContentPayload = z.infer<typeof artifactContentSchema>;
export type Severity = (typeof SEVERITIES)[number];
