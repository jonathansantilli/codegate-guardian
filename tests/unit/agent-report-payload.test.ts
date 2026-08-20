import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import { agentReportPayloadSchema } from "@/src/application/ports/fleet/agent-report-payload";

// A minimal but realistic check-in, shaped exactly as codegate's
// `codegate inventory --format json` emits its summary.
function validPayload() {
  return {
    agent: {
      machineId: "11111111-2222-3333-4444-555555555555",
      version: "1.1.0",
    },
    host: {
      hostname: "dev-laptop",
      platform: "darwin",
      osRelease: "24.6.0",
      username: "jsantilli",
    },
    collectedAt: "2026-08-20T12:00:00.000Z",
    inventory: {
      kb_version: "2026-08-20",
      tools: [{ name: "claude-code", version_range: ">=1.0.0" }],
      items: [
        {
          tool: "claude-code",
          kind: "skill",
          type: "directory",
          scope: "user",
          pattern: ".claude/skills/*/SKILL.md",
          path: "/Users/jsantilli/.claude/skills/podcast/SKILL.md",
          exists: true,
          risk_surface: ["prompt-injection"],
          resolved_against: "/Users/jsantilli",
        },
      ],
    },
  };
}

describe("agentReportPayloadSchema", () => {
  test("accepts a well-formed report", () => {
    const parsed = agentReportPayloadSchema.safeParse(validPayload());
    assert.ok(parsed.success);
    assert.equal(parsed.data.inventory.items[0].tool, "claude-code");
  });

  test("accepts codegate's optional fields being absent", () => {
    const payload = validPayload();
    payload.inventory.items[0] = {
      tool: "cursor",
      kind: "config",
      scope: "project",
      path: "/repo/.cursor/mcp.json",
      exists: false,
      risk_surface: [],
    } as never;
    const parsed = agentReportPayloadSchema.safeParse(payload);
    assert.ok(parsed.success);
  });

  test("defaults an omitted item list to empty", () => {
    const payload = validPayload();
    (payload.inventory as { items?: unknown }).items = undefined;
    const parsed = agentReportPayloadSchema.safeParse(payload);
    assert.ok(parsed.success);
    assert.deepEqual(parsed.data.inventory.items, []);
  });

  test("requires a machine id", () => {
    const payload = validPayload();
    payload.agent.machineId = "";
    assert.equal(agentReportPayloadSchema.safeParse(payload).success, false);
  });

  test("requires a hostname", () => {
    const payload = validPayload();
    payload.host.hostname = "";
    assert.equal(agentReportPayloadSchema.safeParse(payload).success, false);
  });

  test("rejects an unknown item kind", () => {
    const payload = validPayload();
    (payload.inventory.items[0] as { kind: string }).kind = "binary";
    assert.equal(agentReportPayloadSchema.safeParse(payload).success, false);
  });

  test("rejects an unknown scope", () => {
    const payload = validPayload();
    (payload.inventory.items[0] as { scope: string }).scope = "system";
    assert.equal(agentReportPayloadSchema.safeParse(payload).success, false);
  });

  test("rejects a non-ISO collection timestamp", () => {
    const payload = validPayload();
    payload.collectedAt = "yesterday";
    assert.equal(agentReportPayloadSchema.safeParse(payload).success, false);
  });

  test("rejects an item list beyond the cap", () => {
    const payload = validPayload();
    payload.inventory.items = Array.from({ length: 20_001 }, () => ({
      ...validPayload().inventory.items[0],
    }));
    assert.equal(agentReportPayloadSchema.safeParse(payload).success, false);
  });
});
