import { strict as assert } from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { DocumentNotFoundError } from "@/src/application/ports/persistence/document-repository";
import { DrizzleDocumentRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/document-repository";
import { DrizzleSuggestionRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/suggestion-repository";
import { DrizzleUserRepository } from "@/src/infrastructure/persistence/drizzle-postgres/repositories/user-repository";
import {
  type PostgresHarness,
  startPostgresHarness,
} from "@/tests/helpers/testcontainer-pg";

describe("Feature: DocumentRepository + SuggestionRepository (Drizzle-Postgres)", () => {
  let harness: PostgresHarness;
  let documents: DrizzleDocumentRepository;
  let suggestions: DrizzleSuggestionRepository;
  let users: DrizzleUserRepository;
  let userId: string;

  before(async () => {
    harness = await startPostgresHarness();
    documents = new DrizzleDocumentRepository(harness.db);
    suggestions = new DrizzleSuggestionRepository(harness.db);
    users = new DrizzleUserRepository(harness.db);
  });

  after(async () => {
    if (harness) await harness.stop();
  });

  beforeEach(async () => {
    await harness.resetDatabase();
    const guest = await users.createGuest({
      email: "doc-fixture@example.com",
      passwordHash: "h",
    });
    userId = guest.id;
  });

  it("Given save called twice on the same id, when listVersions runs, then both versions are returned in ascending createdAt order", async () => {
    const id = "60000000-0000-0000-0000-000000000001";
    await documents.save({
      id,
      title: "v1 title",
      kind: "text",
      content: "v1",
      userId,
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    await documents.save({
      id,
      title: "v2 title",
      kind: "text",
      content: "v2",
      userId,
    });

    const versions = await documents.listVersions(id);
    assert.equal(versions.length, 2);
    assert.equal(versions[0].content, "v1");
    assert.equal(versions[1].content, "v2");
    assert.ok(versions[0].createdAt < versions[1].createdAt);
  });

  it("Given two versions, when getLatest runs, then only the newest is returned", async () => {
    const id = "60000000-0000-0000-0000-000000000002";
    await documents.save({
      id,
      title: "first",
      kind: "text",
      content: "first",
      userId,
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    await documents.save({
      id,
      title: "second",
      kind: "text",
      content: "second",
      userId,
    });

    const latest = await documents.getLatest(id);
    assert.equal(latest?.content, "second");
  });

  it("Given two versions, when updateLatestContent runs, then only the newer row's content changes", async () => {
    const id = "60000000-0000-0000-0000-000000000003";
    await documents.save({
      id,
      title: "t",
      kind: "text",
      content: "old-first",
      userId,
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    await documents.save({
      id,
      title: "t",
      kind: "text",
      content: "old-second",
      userId,
    });

    const updated = await documents.updateLatestContent({
      id,
      content: "patched",
    });
    assert.equal(updated.length, 1);
    assert.equal(updated[0].content, "patched");

    const versions = await documents.listVersions(id);
    assert.equal(versions[0].content, "old-first");
    assert.equal(versions[1].content, "patched");
  });

  it("Given no existing version, when updateLatestContent runs, then DocumentNotFoundError is thrown", async () => {
    await assert.rejects(
      () =>
        documents.updateLatestContent({
          id: "60000000-0000-0000-0000-0000000000ff",
          content: "noop",
        }),
      DocumentNotFoundError
    );
  });

  it("Given document versions and related suggestions, when deleteAfter runs, then versions after the timestamp and their suggestions disappear", async () => {
    const id = "60000000-0000-0000-0000-000000000010";
    await documents.save({
      id,
      title: "keep",
      kind: "text",
      content: "keep",
      userId,
    });
    // Record the "latest" keep timestamp.
    const [kept] = await documents.listVersions(id);
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    const [latest] = await documents.save({
      id,
      title: "purge",
      kind: "text",
      content: "purge",
      userId,
    });

    // A suggestion that points at the second version.
    await suggestions.save([
      {
        id: "70000000-0000-0000-0000-000000000001",
        documentId: id,
        documentCreatedAt: latest.createdAt,
        originalText: "before",
        suggestedText: "after",
        description: null,
        isResolved: false,
        userId,
        createdAt: new Date(),
      },
    ]);

    const removed = await documents.deleteAfter({
      id,
      timestamp: kept.createdAt,
    });
    assert.equal(removed.length, 1);
    assert.equal(removed[0].content, "purge");

    const survivors = await documents.listVersions(id);
    assert.equal(survivors.length, 1);
    assert.equal(survivors[0].content, "keep");

    const leftoverSuggestions = await suggestions.listByDocumentId(id);
    assert.equal(leftoverSuggestions.length, 0);
  });

  it("Given a save + listByDocumentId, when suggestions land, then they are returned", async () => {
    const id = "60000000-0000-0000-0000-000000000020";
    const [saved] = await documents.save({
      id,
      title: "t",
      kind: "text",
      content: "body",
      userId,
    });
    await suggestions.save([
      {
        id: "70000000-0000-0000-0000-000000000100",
        documentId: id,
        documentCreatedAt: saved.createdAt,
        originalText: "foo",
        suggestedText: "bar",
        description: "why",
        isResolved: false,
        userId,
        createdAt: new Date(),
      },
    ]);
    const list = await suggestions.listByDocumentId(id);
    assert.equal(list.length, 1);
    assert.equal(list[0].suggestedText, "bar");
  });
});
