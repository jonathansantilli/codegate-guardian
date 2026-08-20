import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import { isSecureRequest } from "@/lib/security/request-protocol";

function request(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

describe("isSecureRequest", () => {
  test("reads the scheme from the URL when no proxy header is present", () => {
    assert.equal(isSecureRequest(request("https://example.com/")), true);
    assert.equal(isSecureRequest(request("http://example.com/")), false);
  });

  test("prefers x-forwarded-proto over the URL scheme", () => {
    assert.equal(
      isSecureRequest(
        request("http://example.com/", { "x-forwarded-proto": "https" })
      ),
      true
    );
    assert.equal(
      isSecureRequest(
        request("https://example.com/", { "x-forwarded-proto": "http" })
      ),
      false
    );
  });

  test("uses the first entry of a proxy chain", () => {
    assert.equal(
      isSecureRequest(
        request("http://example.com/", { "x-forwarded-proto": "https, http" })
      ),
      true
    );
    assert.equal(
      isSecureRequest(
        request("http://example.com/", { "x-forwarded-proto": "http, https" })
      ),
      false
    );
  });

  test("ignores case and surrounding whitespace", () => {
    assert.equal(
      isSecureRequest(
        request("http://example.com/", { "x-forwarded-proto": "  HTTPS  " })
      ),
      true
    );
  });

  test("treats an unknown scheme as insecure", () => {
    assert.equal(
      isSecureRequest(
        request("http://example.com/", { "x-forwarded-proto": "ftp" })
      ),
      false
    );
  });
});
