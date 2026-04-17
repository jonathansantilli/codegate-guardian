import type { Suggestion } from "@/src/domain/artifact/entities/suggestion";

export type SuggestionRepository = {
  save(suggestions: Suggestion[]): Promise<void>;
  listByDocumentId(documentId: string): Promise<Suggestion[]>;
};
