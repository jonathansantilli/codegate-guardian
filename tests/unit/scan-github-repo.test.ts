import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isGithubRepositoryUrl,
  normalizeGithubRepositoryUrl,
} from "@/lib/ai/tools/scan-github-repo";

describe("scan-github-repo helpers", () => {
  test("normalizes full GitHub repository URL", () => {
    assert.equal(
      normalizeGithubRepositoryUrl("https://github.com/vercel/ai"),
      "https://github.com/vercel/ai"
    );
  });

  test("normalizes GitHub URL with extra path and .git suffix", () => {
    assert.equal(
      normalizeGithubRepositoryUrl(
        "https://github.com/vercel/ai.git/tree/main/examples"
      ),
      "https://github.com/vercel/ai"
    );
  });

  test("normalizes URL without protocol", () => {
    assert.equal(
      normalizeGithubRepositoryUrl("github.com/vercel/ai"),
      "https://github.com/vercel/ai"
    );
  });

  test("rejects non-GitHub hosts", () => {
    assert.throws(
      () => normalizeGithubRepositoryUrl("https://gitlab.com/vercel/ai"),
      /Unsupported repository URL/
    );
  });

  test("rejects malformed repo paths", () => {
    assert.throws(
      () => normalizeGithubRepositoryUrl("https://github.com/vercel"),
      /Invalid GitHub repository path/
    );
  });

  test("detects valid GitHub repository URLs", () => {
    assert.equal(isGithubRepositoryUrl("https://github.com/vercel/ai"), true);
    assert.equal(isGithubRepositoryUrl("github.com/vercel/ai"), true);
  });

  test("detects invalid repository URLs", () => {
    assert.equal(isGithubRepositoryUrl("https://example.com/repo"), false);
    assert.equal(isGithubRepositoryUrl("hello world"), false);
  });
});
