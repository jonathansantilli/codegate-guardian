// Re-export shim. Canonical location:
// src/infrastructure/persistence/drizzle-postgres/schema.ts.
// Delete when Phase 3c lands UnitOfWork and Phase 5 migrates callers
// through the repository ports.
export * from "@/src/infrastructure/persistence/drizzle-postgres/schema";
