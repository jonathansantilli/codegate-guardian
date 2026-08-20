import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import { getClientIp } from "@/lib/security/client-ip";

function requestWithHeaders(headers: Record<string, string>) {
  return new Request("http://localhost/api/chat", { headers });
}

describe("getClientIp", () => {
  test("returns undefined when no forwarding headers are present", () => {
    assert.equal(getClientIp(requestWithHeaders({})), undefined);
  });

  test("reads a single x-forwarded-for address", () => {
    assert.equal(
      getClientIp(requestWithHeaders({ "x-forwarded-for": "203.0.113.7" })),
      "203.0.113.7"
    );
  });

  test("takes the originating client from an x-forwarded-for chain", () => {
    assert.equal(
      getClientIp(
        requestWithHeaders({
          "x-forwarded-for": "203.0.113.7, 198.51.100.2, 10.0.0.1",
        })
      ),
      "203.0.113.7"
    );
  });

  test("trims surrounding whitespace", () => {
    assert.equal(
      getClientIp(requestWithHeaders({ "x-forwarded-for": "  203.0.113.7  " })),
      "203.0.113.7"
    );
  });

  test("skips empty leading entries in the chain", () => {
    assert.equal(
      getClientIp(requestWithHeaders({ "x-forwarded-for": " , 198.51.100.2" })),
      "198.51.100.2"
    );
  });

  test("falls back to x-real-ip", () => {
    assert.equal(
      getClientIp(requestWithHeaders({ "x-real-ip": "198.51.100.2" })),
      "198.51.100.2"
    );
  });

  test("prefers x-forwarded-for over x-real-ip", () => {
    assert.equal(
      getClientIp(
        requestWithHeaders({
          "x-forwarded-for": "203.0.113.7",
          "x-real-ip": "198.51.100.2",
        })
      ),
      "203.0.113.7"
    );
  });

  test("falls back to x-real-ip when x-forwarded-for is blank", () => {
    assert.equal(
      getClientIp(
        requestWithHeaders({
          "x-forwarded-for": "  ",
          "x-real-ip": "198.51.100.2",
        })
      ),
      "198.51.100.2"
    );
  });

  test("preserves IPv6 addresses", () => {
    assert.equal(
      getClientIp(
        requestWithHeaders({ "x-forwarded-for": "2001:db8::1, 198.51.100.2" })
      ),
      "2001:db8::1"
    );
  });
});
