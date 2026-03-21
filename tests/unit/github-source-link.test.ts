import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import { buildGitHubSourceUrl } from "@/lib/security/github-source-link";

describe("github source link builder", () => {
  test("builds file link with line anchor", () => {
    const url = buildGitHubSourceUrl({
      repositoryUrl: "https://github.com/cloudflare/skills",
      filePath: "skills/agents-sdk/SKILL.md",
      line: 49,
    });

    assert.equal(
      url,
      "https://github.com/cloudflare/skills/blob/HEAD/skills/agents-sdk/SKILL.md#L49"
    );
  });

  test("builds file link without line when line is missing", () => {
    const url = buildGitHubSourceUrl({
      repositoryUrl: "https://github.com/cloudflare/skills.git",
      filePath: "/.mcp.json",
      line: null,
    });

    assert.equal(
      url,
      "https://github.com/cloudflare/skills/blob/HEAD/.mcp.json"
    );
  });

  test("returns null for non-github repositories", () => {
    const url = buildGitHubSourceUrl({
      repositoryUrl: "https://gitlab.com/acme/repo",
      filePath: "README.md",
      line: 1,
    });

    assert.equal(url, null);
  });

  test("returns null when repository or file is missing", () => {
    assert.equal(
      buildGitHubSourceUrl({
        repositoryUrl: null,
        filePath: "README.md",
        line: 1,
      }),
      null
    );

    assert.equal(
      buildGitHubSourceUrl({
        repositoryUrl: "https://github.com/acme/repo",
        filePath: null,
        line: 1,
      }),
      null
    );
  });
});
