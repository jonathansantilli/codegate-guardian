import { strict as assert } from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import {
  contentTypeForKey,
  createFilesystemObjectStore,
} from "@/src/infrastructure/storage/filesystem-object-store";

const PUBLIC_URL_BASE = "http://localhost:3000/api/uploads";

let rootDir: string;

before(() => {
  rootDir = mkdtempSync(join(tmpdir(), "guardian-object-store-"));
});

after(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

function makeStore() {
  return createFilesystemObjectStore({
    rootDir,
    publicUrlBase: PUBLIC_URL_BASE,
  });
}

describe("filesystem object store", () => {
  test("writes the object and describes it", async () => {
    const store = makeStore();
    const body = new Uint8Array([1, 2, 3, 4]);

    const stored = await store.put({
      key: "id1-photo.png",
      body,
      contentType: "image/png",
    });

    assert.deepEqual(stored, {
      url: `${PUBLIC_URL_BASE}/id1-photo.png`,
      key: "id1-photo.png",
      contentType: "image/png",
      size: 4,
    });
    assert.deepEqual(
      new Uint8Array(readFileSync(join(rootDir, "id1-photo.png"))),
      body
    );
  });

  test("round-trips the stored bytes", async () => {
    const store = makeStore();
    const body = new Uint8Array([9, 8, 7]);

    await store.put({ key: "id2-photo.png", body, contentType: "image/png" });
    const entry = await store.get("id2-photo.png");

    assert.ok(entry);
    assert.deepEqual(entry.body, body);
    assert.equal(entry.contentType, "image/png");
  });

  test("creates nested directories for nested keys", async () => {
    const store = makeStore();

    const stored = await store.put({
      key: "2026/08/id3-photo.jpg",
      body: new Uint8Array([1]),
      contentType: "image/jpeg",
    });

    assert.equal(stored.url, `${PUBLIC_URL_BASE}/2026/08/id3-photo.jpg`);
    const entry = await store.get("2026/08/id3-photo.jpg");
    assert.ok(entry);
  });

  test("trims a trailing slash from the public base", async () => {
    const store = createFilesystemObjectStore({
      rootDir,
      publicUrlBase: `${PUBLIC_URL_BASE}/`,
    });

    const stored = await store.put({
      key: "id4-photo.png",
      body: new Uint8Array([1]),
      contentType: "image/png",
    });

    assert.equal(stored.url, `${PUBLIC_URL_BASE}/id4-photo.png`);
  });

  test("returns null for a missing key", async () => {
    const store = makeStore();
    assert.equal(await store.get("does-not-exist.png"), null);
  });

  test("refuses to write outside the root", async () => {
    const store = makeStore();

    await assert.rejects(
      () =>
        store.put({
          key: "../escaped.png",
          body: new Uint8Array([1]),
          contentType: "image/png",
        }),
      /Unsafe object key/
    );
  });

  test("refuses to read outside the root", async () => {
    const store = makeStore();

    assert.equal(await store.get("../../etc/passwd"), null);
    assert.equal(await store.get("/etc/passwd"), null);
  });
});

describe("contentTypeForKey", () => {
  test("maps known image extensions", () => {
    assert.equal(contentTypeForKey("a.png"), "image/png");
    assert.equal(contentTypeForKey("a.JPG"), "image/jpeg");
    assert.equal(contentTypeForKey("a.jpeg"), "image/jpeg");
  });

  test("falls back for unknown or absent extensions", () => {
    assert.equal(contentTypeForKey("a.xyz"), "application/octet-stream");
    assert.equal(contentTypeForKey("noextension"), "application/octet-stream");
  });
});
