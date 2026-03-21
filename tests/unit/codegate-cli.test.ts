import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildCodegateScanNpxArgs,
  withCodegateNpmEnv,
} from "@/lib/security/codegate-cli";

describe("codegate cli invocation", () => {
  test("builds repository scan args using codegate-ai package", () => {
    const args = buildCodegateScanNpxArgs({
      target: "https://github.com/owner/repo",
    });

    assert.deepEqual(args, [
      "--yes",
      "codegate-ai",
      "scan",
      "https://github.com/owner/repo",
      "--force",
      "--format",
      "json",
      "--no-tui",
    ]);
  });

  test("builds skill scan args using --skill", () => {
    const args = buildCodegateScanNpxArgs({
      target: "https://github.com/owner/repo",
      skillName: "find-skills",
    });

    assert.deepEqual(args, [
      "--yes",
      "codegate-ai",
      "scan",
      "https://github.com/owner/repo",
      "--skill",
      "find-skills",
      "--force",
      "--format",
      "json",
      "--no-tui",
    ]);
  });

  test("sets npm cache to /tmp to avoid readonly home directories", () => {
    const env = withCodegateNpmEnv({
      ...process.env,
      npm_config_cache: "",
    });
    assert.equal(env.npm_config_cache, "/tmp/.npm");
  });
});
