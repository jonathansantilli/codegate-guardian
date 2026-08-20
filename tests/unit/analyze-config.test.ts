import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import {
  guessConfigFilePath,
  sanitizeRelativePath,
} from "@/lib/ai/tools/analyze-config";

describe("analyze-config helpers", () => {
  test("guesses Claude MCP path for mcpServers JSON", () => {
    const content = '{"mcpServers":{"demo":{"command":"npx"}}}';
    assert.equal(guessConfigFilePath(content), ".claude/mcp_servers.json");
  });

  test("guesses AGENTS.md for markdown content", () => {
    const content = "# Project Agent Rules\n\n<!-- hidden -->";
    assert.equal(guessConfigFilePath(content), "AGENTS.md");
  });

  test("prefers provided filename hint", () => {
    const content = "{}";
    assert.equal(
      guessConfigFilePath(content, "custom-settings.json"),
      ".claude/custom-settings.json"
    );
  });

  test("sanitizes and keeps safe relative paths", () => {
    assert.equal(
      sanitizeRelativePath(".claude/mcp_servers.json"),
      ".claude/mcp_servers.json"
    );
  });

  test("rejects path traversal", () => {
    assert.throws(
      () => sanitizeRelativePath("../.ssh/id_rsa"),
      /Invalid filename/
    );
  });
});
