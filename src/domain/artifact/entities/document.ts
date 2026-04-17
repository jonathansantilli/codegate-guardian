import type { ArtifactKind } from "@/src/domain/artifact/value-objects/artifact-kind";

// Documents use a composite primary key (id, createdAt) so each save
// under the same id produces a new version row. Callers that expect a
// single "current" document should use DocumentRepository.getLatest().
export type Document = {
  id: string;
  createdAt: Date;
  title: string;
  content: string | null;
  kind: ArtifactKind;
  userId: string;
};
