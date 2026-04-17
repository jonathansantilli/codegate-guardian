import { eq } from "drizzle-orm";
import type { SuggestionRepository } from "@/src/application/ports/persistence/suggestion-repository";
import type { Suggestion } from "@/src/domain/artifact/entities/suggestion";
import type { DrizzleDb } from "@/src/infrastructure/persistence/drizzle-postgres/client";
import { suggestion } from "@/src/infrastructure/persistence/drizzle-postgres/schema";

export class DrizzleSuggestionRepository implements SuggestionRepository {
  constructor(private readonly db: DrizzleDb) {}

  async save(suggestions: Suggestion[]): Promise<void> {
    if (suggestions.length === 0) return;
    await this.db.insert(suggestion).values(
      suggestions.map((row) => ({
        id: row.id,
        documentId: row.documentId,
        documentCreatedAt: row.documentCreatedAt,
        originalText: row.originalText,
        suggestedText: row.suggestedText,
        description: row.description,
        isResolved: row.isResolved,
        userId: row.userId,
        createdAt: row.createdAt,
      }))
    );
  }

  async listByDocumentId(documentId: string): Promise<Suggestion[]> {
    return (await this.db
      .select()
      .from(suggestion)
      .where(eq(suggestion.documentId, documentId))) as Suggestion[];
  }
}
