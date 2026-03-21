import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import {
  extractSkillNameFromRelativePath,
  isGithubRepositoryUrl,
  isSkillSelectionRequiredMessage,
  normalizeGithubRepositoryUrl,
  routeSkillScanRequest,
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

describe("scan-github-repo skill routing", () => {
  test("uses repository scan mode by default", () => {
    assert.deepEqual(
      routeSkillScanRequest({
        scanMode: "repository",
        availableSkills: ["security-review", "threat-model"],
      }),
      { action: "scan-repository" }
    );
  });

  test("auto-selects the only available skill in skills mode", () => {
    assert.deepEqual(
      routeSkillScanRequest({
        scanMode: "skills",
        availableSkills: ["security-review"],
      }),
      {
        action: "scan-skill",
        skillName: "security-review",
        autoSelected: true,
      }
    );
  });

  test("asks for skill selection when multiple skills are available", () => {
    assert.deepEqual(
      routeSkillScanRequest({
        scanMode: "skills",
        availableSkills: ["a", "b"],
      }),
      {
        action: "needs-selection",
        availableSkills: ["a", "b"],
      }
    );
  });

  test("selects explicit skill when provided and valid", () => {
    assert.deepEqual(
      routeSkillScanRequest({
        scanMode: "skills",
        skillName: "threat-model",
        availableSkills: ["security-review", "threat-model"],
      }),
      {
        action: "scan-skill",
        skillName: "threat-model",
        autoSelected: false,
      }
    );
  });

  test("returns invalid skill decision for unknown skill", () => {
    assert.deepEqual(
      routeSkillScanRequest({
        scanMode: "skills",
        skillName: "not-here",
        availableSkills: ["security-review", "threat-model"],
      }),
      {
        action: "invalid-skill",
        skillName: "not-here",
        availableSkills: ["security-review", "threat-model"],
      }
    );
  });

  test("supports explicit all-skills selection", () => {
    assert.deepEqual(
      routeSkillScanRequest({
        scanMode: "skills",
        skillName: "all",
        availableSkills: ["security-review", "threat-model"],
      }),
      {
        action: "scan-all-skills",
        skillNames: ["security-review", "threat-model"],
      }
    );
  });
});

describe("scan-github-repo skill discovery helpers", () => {
  test("extracts skill name from skills root path", () => {
    assert.equal(
      extractSkillNameFromRelativePath("skills/find-skills/SKILL.md"),
      "find-skills"
    );
  });

  test("extracts skill name from .claude skills path", () => {
    assert.equal(
      extractSkillNameFromRelativePath(".claude/skills/debug/SKILL.md"),
      "debug"
    );
  });

  test("ignores non-skill file paths", () => {
    assert.equal(extractSkillNameFromRelativePath("AGENTS.md"), null);
    assert.equal(
      extractSkillNameFromRelativePath(".claude/skills/debug/README.md"),
      null
    );
  });
});

describe("scan-github-repo stderr parsing", () => {
  test("detects multi-skill selection messages", () => {
    assert.equal(
      isSkillSelectionRequiredMessage(
        "Scan failed: Multiple skills detected (a, b). Add --skill."
      ),
      true
    );
  });

  test("does not treat generic errors as skill-selection requests", () => {
    assert.equal(
      isSkillSelectionRequiredMessage(
        "Scan failed: repository could not be cloned"
      ),
      false
    );
  });
});
