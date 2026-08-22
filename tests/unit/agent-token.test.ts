import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import { extractBearerToken } from "@/lib/security/agent-token";

describe("extractBearerToken", () => {
  test("reads a bearer token", () => {
    assert.equal(extractBearerToken("Bearer abc123"), "abc123");
  });

  test("accepts any casing of the scheme", () => {
    assert.equal(extractBearerToken("bearer abc123"), "abc123");
    assert.equal(extractBearerToken("BEARER abc123"), "abc123");
  });

  test("tolerates extra whitespace", () => {
    assert.equal(extractBearerToken("Bearer    abc123  "), "abc123");
  });

  test("returns undefined for a missing or non-bearer header", () => {
    assert.equal(extractBearerToken(null), undefined);
    assert.equal(extractBearerToken(""), undefined);
    assert.equal(extractBearerToken("Basic abc123"), undefined);
    assert.equal(extractBearerToken("abc123"), undefined);
  });

  test("returns undefined for an empty token", () => {
    assert.equal(extractBearerToken("Bearer "), undefined);
    assert.equal(extractBearerToken("Bearer    "), undefined);
  });
});
