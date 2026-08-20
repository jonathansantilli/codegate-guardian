import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildObjectKey,
  isSafeObjectKey,
  sanitizeFileName,
} from "@/src/domain/storage/object-key";

describe("sanitizeFileName", () => {
  test("keeps an already-safe name unchanged", () => {
    assert.equal(sanitizeFileName("screenshot-1.png"), "screenshot-1.png");
  });

  test("replaces unsafe characters", () => {
    assert.equal(sanitizeFileName("my photo (1).png"), "my_photo__1_.png");
  });

  test("strips directory components", () => {
    assert.equal(sanitizeFileName("a/b/c/photo.png"), "photo.png");
    assert.equal(sanitizeFileName("a\\b\\photo.png"), "photo.png");
  });

  test("neutralizes traversal attempts", () => {
    assert.equal(sanitizeFileName("../../etc/passwd"), "passwd");
    assert.equal(sanitizeFileName(".."), "upload");
  });

  test("never produces a dotfile", () => {
    assert.equal(sanitizeFileName(".env"), "env");
  });

  test("falls back when nothing usable remains", () => {
    assert.equal(sanitizeFileName(""), "upload");
    assert.equal(sanitizeFileName("/"), "upload");
  });

  test("truncates very long names", () => {
    const name = `${"a".repeat(300)}.png`;
    assert.equal(sanitizeFileName(name).length, 96);
  });
});

describe("buildObjectKey", () => {
  test("prefixes the sanitized name with the supplied id", () => {
    assert.equal(
      buildObjectKey({ fileName: "photo.png", id: "abc-123" }),
      "abc-123-photo.png"
    );
  });

  test("produces a safe key even from a hostile filename", () => {
    const key = buildObjectKey({
      fileName: "../../../etc/shadow",
      id: "abc-123",
    });
    assert.equal(key, "abc-123-shadow");
    assert.ok(isSafeObjectKey(key));
  });
});

describe("isSafeObjectKey", () => {
  test("accepts plain and nested keys", () => {
    assert.ok(isSafeObjectKey("abc-photo.png"));
    assert.ok(isSafeObjectKey("2026/08/abc-photo.png"));
  });

  test("rejects traversal segments", () => {
    assert.equal(isSafeObjectKey(".."), false);
    assert.equal(isSafeObjectKey("../secret"), false);
    assert.equal(isSafeObjectKey("a/../../secret"), false);
    assert.equal(isSafeObjectKey("."), false);
  });

  test("rejects absolute paths and empty segments", () => {
    assert.equal(isSafeObjectKey("/etc/passwd"), false);
    assert.equal(isSafeObjectKey("a//b"), false);
    assert.equal(isSafeObjectKey(""), false);
  });

  test("rejects backslashes, spaces, and null bytes", () => {
    assert.equal(isSafeObjectKey("a\\b"), false);
    assert.equal(isSafeObjectKey("a b"), false);
    assert.equal(isSafeObjectKey("a\0b"), false);
  });

  test("rejects over-long keys", () => {
    assert.equal(isSafeObjectKey("a".repeat(513)), false);
  });
});
