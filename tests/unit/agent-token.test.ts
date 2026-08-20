import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import {
  extractBearerToken,
  isValidAgentToken,
} from "@/lib/security/agent-token";

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

describe("isValidAgentToken", () => {
  test("accepts an exact match", () => {
    assert.equal(isValidAgentToken("s3cret-token", "s3cret-token"), true);
  });

  test("rejects a wrong token of the same length", () => {
    assert.equal(isValidAgentToken("s3cret-tokeX", "s3cret-token"), false);
  });

  test("rejects tokens of differing length", () => {
    assert.equal(isValidAgentToken("s3cret", "s3cret-token"), false);
    assert.equal(isValidAgentToken("s3cret-token-long", "s3cret-token"), false);
  });

  // Ingest must be closed by default: an instance with no token configured
  // cannot be written to, rather than accepting every caller.
  test("rejects when no token is configured", () => {
    assert.equal(isValidAgentToken("anything", undefined), false);
    assert.equal(isValidAgentToken("anything", ""), false);
  });

  test("rejects when the caller presents nothing", () => {
    assert.equal(isValidAgentToken(undefined, "s3cret-token"), false);
  });

  test("rejects when neither side has a token", () => {
    assert.equal(isValidAgentToken(undefined, undefined), false);
  });

  test("handles multi-byte tokens without throwing", () => {
    assert.equal(isValidAgentToken("tökén-✓", "tökén-✓"), true);
    assert.equal(isValidAgentToken("tökén-✗", "tökén-✓"), false);
  });
});
