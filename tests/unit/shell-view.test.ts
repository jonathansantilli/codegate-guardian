import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import { getShellViewFromPathname } from "@/lib/security/shell-view";

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

  test("uses fleet view for the fleet path", () => {
    assert.equal(getShellViewFromPathname("/fleet"), "fleet");
  });

  test("uses fleet view for a specific machine", () => {
    assert.equal(getShellViewFromPathname("/fleet/host-123"), "fleet");
  });

  // Guards against a prefix match swallowing an unrelated future route.
  test("does not treat a path merely starting with fleet as the fleet view", () => {
    assert.equal(getShellViewFromPathname("/fleetwood"), "report");
  });

  test("falls back to report view for unknown path", () => {
    assert.equal(getShellViewFromPathname("/unknown"), "report");
  });
});
