import { and, asc, desc, eq, gt } from "drizzle-orm";
import {
  type DeleteDocumentsAfterInput,
  DocumentNotFoundError,
  type DocumentRepository,
  type SaveDocumentInput,
  type UpdateDocumentContentInput,
} from "@/src/application/ports/persistence/document-repository";
import type { Document } from "@/src/domain/artifact/entities/document";
import type { DrizzleDb } from "@/src/infrastructure/persistence/drizzle-postgres/client";
import {
  document,
  suggestion,
} from "@/src/infrastructure/persistence/drizzle-postgres/schema";

export class DrizzleDocumentRepository implements DocumentRepository {
  constructor(private readonly db: DrizzleDb) {}

  async save(input: SaveDocumentInput): Promise<Document[]> {
    return (await this.db
      .insert(document)
      .values({
        id: input.id,
        title: input.title,
        kind: input.kind,
        content: input.content,
        userId: input.userId,
        createdAt: new Date(),
      })
      .returning()) as Document[];
  }

  async updateLatestContent(
    input: UpdateDocumentContentInput
  ): Promise<Document[]> {
    const docs = (await this.db
      .select()
      .from(document)
      .where(eq(document.id, input.id))
      .orderBy(desc(document.createdAt))
      .limit(1)) as Document[];

    const latest = docs[0];
    if (!latest) {
      throw new DocumentNotFoundError(input.id);
    }

    return (await this.db
      .update(document)
      .set({ content: input.content })
      .where(
        and(eq(document.id, input.id), eq(document.createdAt, latest.createdAt))
      )
      .returning()) as Document[];
  }

  async listVersions(id: string): Promise<Document[]> {
    return (await this.db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt))) as Document[];
  }

  async getLatest(id: string): Promise<Document | null> {
    const [row] = (await this.db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt))) as Document[];
    return row ?? null;
  }

  async deleteAfter(input: DeleteDocumentsAfterInput): Promise<Document[]> {
    await this.db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, input.id),
          gt(suggestion.documentCreatedAt, input.timestamp)
        )
      );

    return (await this.db
      .delete(document)
      .where(
        and(eq(document.id, input.id), gt(document.createdAt, input.timestamp))
      )
      .returning()) as Document[];
  }
}
