import { createHash } from "node:crypto";
import { isCredentialFree, isUploadableFormat } from "./collection-surfaces";

/**
 * Decides which offered artifacts this server is willing to keep.
 *
 * The agent applies the same policy before it sends anything, and this exists
 * because that is not a guarantee. The policy is published over the network to
 * a program running on somebody else's laptop; a modified agent, a replayed
 * body, or simply an old version can offer whatever it likes. So every rule
 * that decided what to send is applied again to what actually arrived, by the
 * side that has to live with the consequences of being wrong.
 *
 * Pure, and separate from the route, so each refusal below is a unit test
 * rather than something that needs a database and an HTTP request to observe.
 */

export type OfferedContent = { sha256: string; content: string };

/** The inventory rows in the same report, which say what each hash IS. */
export type ReportedArtifact = {
  sha256?: string;
  riskSurface: string[];
  /** How the file is written. Absent from agents predating the field. */
  format?: string | null;
};

export type ContentPolicy = {
  collectContent: boolean;
  allowedRiskSurfaces: string[];
  maxBytesPerArtifact: number;
  maxArtifactsPerReport: number;
};

export type AcceptedContent = {
  contentHash: string;
  byteLength: number;
  content: string;
  riskSurface: string[];
};

export const CONTENT_REFUSAL = {
  /** The policy is off, so nothing was asked for. */
  NotCollecting: "not_collecting",
  /** No inventory row in this report carries that hash. */
  UnknownArtifact: "unknown_artifact",
  /** The bytes do not hash to the name they were filed under. */
  HashMismatch: "hash_mismatch",
  /** A surface this build never accepts, or one the policy excludes. */
  SurfaceNotAllowed: "surface_not_allowed",
  /** Not a prose file — or an agent too old to say what it is. */
  FormatNotAllowed: "format_not_allowed",
  /** Larger than the policy permits. */
  TooLarge: "too_large",
  /** Beyond the per-report count. */
  OverLimit: "over_limit",
} as const;

export type ContentRefusal =
  (typeof CONTENT_REFUSAL)[keyof typeof CONTENT_REFUSAL];

export type AcceptContentResult = {
  accepted: AcceptedContent[];
  refused: { contentHash: string; reason: ContentRefusal }[];
};

function hashOf(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

export function acceptArtifactContent(
  offered: OfferedContent[],
  reported: ReportedArtifact[],
  policy: ContentPolicy
): AcceptContentResult {
  if (offered.length === 0) {
    return { accepted: [], refused: [] };
  }

  if (!policy.collectContent) {
    return {
      accepted: [],
      refused: offered.map((item) => ({
        contentHash: item.sha256,
        reason: CONTENT_REFUSAL.NotCollecting,
      })),
    };
  }

  // What each hash is, according to this report's own inventory. A hash can
  // appear on more than one row — the same file resolved from two patterns —
  // so the surfaces are unioned: an artifact is as sensitive as the most
  // sensitive thing any row says it is.
  const surfacesByHash = new Map<string, Set<string>>();
  // A hash can appear on more than one row; if any row calls it something
  // other than prose, that is the answer. The same file described two ways is
  // as sensitive as the more sensitive description.
  const formatsByHash = new Map<string, Set<string | null>>();
  for (const item of reported) {
    if (!item.sha256) {
      continue;
    }
    const existing = surfacesByHash.get(item.sha256) ?? new Set<string>();
    for (const surface of item.riskSurface) {
      existing.add(surface);
    }
    surfacesByHash.set(item.sha256, existing);

    const formats = formatsByHash.get(item.sha256) ?? new Set<string | null>();
    formats.add(item.format ?? null);
    formatsByHash.set(item.sha256, formats);
  }

  const accepted: AcceptedContent[] = [];
  const refused: { contentHash: string; reason: ContentRefusal }[] = [];
  const seen = new Set<string>();

  for (const item of offered) {
    if (seen.has(item.sha256)) {
      continue;
    }
    seen.add(item.sha256);

    if (accepted.length >= policy.maxArtifactsPerReport) {
      refused.push({
        contentHash: item.sha256,
        reason: CONTENT_REFUSAL.OverLimit,
      });
      continue;
    }

    const surfaces = surfacesByHash.get(item.sha256);
    if (!surfaces) {
      // Nothing in this report claims to be this artifact. Accepting it would
      // mean storing bytes no machine is on record as carrying.
      refused.push({
        contentHash: item.sha256,
        reason: CONTENT_REFUSAL.UnknownArtifact,
      });
      continue;
    }

    // Before anything else is believed about it: the store is keyed by hash,
    // so bytes filed under a hash they do not have would corrupt every
    // identity claim the rest of the product rests on.
    if (hashOf(item.content) !== item.sha256) {
      refused.push({
        contentHash: item.sha256,
        reason: CONTENT_REFUSAL.HashMismatch,
      });
      continue;
    }

    // How the file is written decides this, not what it is about. A skill
    // that can influence MCP configuration is still markdown; a .toml command
    // definition is still configuration, and configuration holds credentials.
    const formats = [...(formatsByHash.get(item.sha256) ?? new Set())];
    if (formats.length === 0 || !formats.every((f) => isUploadableFormat(f))) {
      refused.push({
        contentHash: item.sha256,
        reason: CONTENT_REFUSAL.FormatNotAllowed,
      });
      continue;
    }

    const riskSurface = [...surfaces].sort();
    const withinBuild = isCredentialFree(riskSurface);
    const withinPolicy = riskSurface.every((surface) =>
      policy.allowedRiskSurfaces.includes(surface)
    );
    if (!(withinBuild && withinPolicy)) {
      refused.push({
        contentHash: item.sha256,
        reason: CONTENT_REFUSAL.SurfaceNotAllowed,
      });
      continue;
    }

    // Bytes, not characters: the cap is about what this costs to store, and a
    // string full of astral-plane characters is twice its length in the
    // database.
    const byteLength = Buffer.byteLength(item.content, "utf8");
    if (byteLength > policy.maxBytesPerArtifact) {
      refused.push({
        contentHash: item.sha256,
        reason: CONTENT_REFUSAL.TooLarge,
      });
      continue;
    }

    accepted.push({
      contentHash: item.sha256,
      byteLength,
      content: item.content,
      riskSurface,
    });
  }

  return { accepted, refused };
}
