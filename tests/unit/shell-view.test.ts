import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import { getShellViewFromPathname } from "@/src/domain/reporting/services/shell-view";

describe("shell view routing", () => {
  test("uses report view for root path", () => {
    assert.equal(getShellViewFromPathname("/"), "report");
  });

  test("uses chat view for scan path", () => {
    assert.equal(getShellViewFromPathname("/scan"), "chat");
  });

  test("uses chat view for chat session path", () => {
    assert.equal(getShellViewFromPathname("/chat/abc123"), "chat");
  });

  // Guards against a prefix match swallowing an unrelated future route.
  test("falls back to report view for unknown path", () => {
    assert.equal(getShellViewFromPathname("/unknown"), "report");
  });
});
