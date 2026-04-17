export const ARTIFACT_KINDS = ["text", "code", "image", "sheet"] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export function isArtifactKind(value: unknown): value is ArtifactKind {
  return (
    typeof value === "string" &&
    (ARTIFACT_KINDS as readonly string[]).includes(value)
  );
}
