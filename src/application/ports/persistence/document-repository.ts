import type { Document } from "@/src/domain/artifact/entities/document";
import type { ArtifactKind } from "@/src/domain/artifact/value-objects/artifact-kind";

export type SaveDocumentInput = {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
};

export type UpdateDocumentContentInput = {
  id: string;
  content: string;
};

export type DeleteDocumentsAfterInput = {
  id: string;
  timestamp: Date;
};

export class DocumentNotFoundError extends Error {
  constructor(public readonly documentId: string) {
    super(`Document ${documentId} not found`);
    this.name = "DocumentNotFoundError";
  }
}

export type DocumentRepository = {
  save(input: SaveDocumentInput): Promise<Document[]>;
  /**
   * Updates the most recent version for the given document id. Throws
   * `DocumentNotFoundError` when there is no existing version.
   */
  updateLatestContent(input: UpdateDocumentContentInput): Promise<Document[]>;
  listVersions(id: string): Promise<Document[]>;
  getLatest(id: string): Promise<Document | null>;
  deleteAfter(input: DeleteDocumentsAfterInput): Promise<Document[]>;
};
