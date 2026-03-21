import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import {
  complianceScoreClasses,
  riskExposureScoreClasses,
} from "@/lib/security/report-score-semantics";

describe("report score semantics", () => {
  test("treats high risk score as bad (red)", () => {
    assert.match(riskExposureScoreClasses(100), /border-red/);
    assert.match(riskExposureScoreClasses(90), /border-red/);
    assert.match(riskExposureScoreClasses(60), /border-amber/);
    assert.match(riskExposureScoreClasses(10), /border-emerald/);
  });

  test("treats high governance score as good (green)", () => {
    assert.match(complianceScoreClasses(100), /border-emerald/);
    assert.match(complianceScoreClasses(90), /border-emerald/);
    assert.match(complianceScoreClasses(60), /border-amber/);
    assert.match(complianceScoreClasses(10), /border-red/);
  });
});
