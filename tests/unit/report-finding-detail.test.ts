import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import { extractFindingLocations } from "@/src/domain/reporting/services/report-finding-detail";

describe("report finding detail metadata", () => {
  test("uses structured raw finding location and affected locations", () => {
    const detail = extractFindingLocations({
      filePath: ".claude-plugin/marketplace.json",
      evidence: 'line 6\n6 | "url": "https://workers.cloudflare.com"',
      rawFinding: {
        location: {
          field: "owner.url",
          line: 6,
          column: 5,
        },
        affected_locations: [
          {
            file_path: ".claude-plugin/marketplace.json",
            location: {
              field: "owner.url",
              line: 6,
              column: 5,
            },
          },
          {
            file_path: ".cursor-plugin/marketplace.json",
            location: {
              field: "owner.url",
              line: 4,
              column: 3,
            },
          },
        ],
      },
    });

    assert.equal(detail.primaryLocation?.line, 6);
    assert.equal(detail.primaryLocation?.column, 5);
    assert.equal(detail.primaryLocation?.field, "owner.url");
    assert.equal(
      detail.primaryLocation?.filePath,
      ".claude-plugin/marketplace.json"
    );
    assert.equal(detail.affectedLocations.length, 2);
    assert.equal(
      detail.affectedLocations[1]?.filePath,
      ".cursor-plugin/marketplace.json"
    );
    assert.equal(detail.affectedLocations[1]?.line, 4);
  });

  test("falls back to evidence line when location line is missing", () => {
    const detail = extractFindingLocations({
      filePath: ".github/workflows/ci.yml",
      evidence:
        "line 79 79 | --dangerously-skip-permissions cannot be used with root/sudo privileges",
      rawFinding: {
        location: {
          field: "jobs.scan.steps[2]",
        },
      },
    });

    assert.equal(detail.primaryLocation?.filePath, ".github/workflows/ci.yml");
    assert.equal(detail.primaryLocation?.field, "jobs.scan.steps[2]");
    assert.equal(detail.primaryLocation?.line, 79);
    assert.equal(detail.primaryLocation?.column, null);
  });
});
