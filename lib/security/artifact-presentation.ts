/**
 * Presentation rules for fleet artifacts.
 *
 * The one idea this screen exists to carry: a name is a label, and the content
 * hash is the identity. Anything that would merge two hashes under one name is
 * a bug, so the helpers here are deliberately about telling them apart.
 */

export type VariantLike = {
  contentHash: string;
  machineCount: number;
};

export type ArtifactLike = {
  name: string;
  variants: VariantLike[];
  machineCount: number;
};

/** Short form for display. Never used for comparison — only the full hash is. */
export function shortHash(contentHash: string): string {
  const hex = contentHash.replace(/^sha256:/, "");
  return hex.length <= 16 ? hex : `${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

/**
 * Whether a name covers more than one distinct file. This is what the console
 * must surface: a single row hiding several variants is exactly the merge the
 * hash model exists to prevent.
 */
export function hasMultipleVariants(artifact: ArtifactLike): boolean {
  return artifact.variants.length > 1;
}

/**
 * How widespread an artifact is, as a share of the fleet. Drawn to scale or
 * not drawn: a bar that overstates spread is worse than no bar.
 */
export function fleetShare(machineCount: number, fleetSize: number): number {
  if (fleetSize <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((machineCount / fleetSize) * 100));
}

/** Variants ordered by how many machines carry them, widest first. */
export function orderVariants<T extends VariantLike>(variants: T[]): T[] {
  return [...variants].sort((a, b) => b.machineCount - a.machineCount);
}

/**
 * The URL form of a content hash.
 *
 * A hash is always `sha256:<hex>`, so the algorithm prefix carries nothing in
 * a path segment — and its colon has to be percent-encoded, which routers
 * then re-encode into a value that no longer matches anything. The digest
 * alone is unambiguous and survives a round trip untouched.
 */
export function hashSlug(contentHash: string): string {
  return contentHash.replace(/^sha256:/, "");
}

/** The stored form of a hash taken from a URL. Round-trips `hashSlug`. */
export function hashFromSlug(slug: string): string {
  return slug.startsWith("sha256:") ? slug : `sha256:${slug}`;
}
