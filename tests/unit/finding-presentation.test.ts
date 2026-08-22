import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isOutstanding,
  STATUS_LABEL,
  severityRank,
  statusExplanation,
} from "@/lib/security/finding-presentation";

describe("severityRank", () => {
  test("orders critical first and info last", () => {
    const sorted = ["LOW", "CRITICAL", "INFO", "HIGH", "MEDIUM"].sort(
      (a, b) => severityRank(a) - severityRank(b)
    );
    assert.deepEqual(sorted, ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]);
  });

  test("sorts an unknown severity last rather than first", () => {
    assert.ok(severityRank("WEIRD") > severityRank("INFO"));
  });
});

describe("statusExplanation", () => {
  const seen = new Date("2026-08-22T12:04:00Z");

  // The console must never imply a person closed a finding — the report did.
  test("resolved cites the report, not a person", () => {
    const text = statusExplanation("resolved", seen);
    assert.match(text, /Confirmed absent in a report/);
    assert.match(text, /2026-08-22 12:04/);
  });

  test("acknowledged says it does not close anything", () => {
    assert.match(
      statusExplanation("acknowledged", seen),
      /closes when a later report/
    );
  });

  test("open says a machine still reports it", () => {
    assert.match(statusExplanation("open", seen), /latest report/);
  });

  test("regressed says it came back", () => {
    assert.match(statusExplanation("regressed", seen), /came back/);
  });
});

describe("isOutstanding", () => {
  test("everything except resolved needs a person's attention", () => {
    assert.equal(isOutstanding("open"), true);
    assert.equal(isOutstanding("acknowledged"), true);
    assert.equal(isOutstanding("regressed"), true);
    assert.equal(isOutstanding("resolved"), false);
  });
});

describe("STATUS_LABEL", () => {
  test("names every lifecycle state", () => {
    assert.deepEqual(Object.keys(STATUS_LABEL).sort(), [
      "acknowledged",
      "open",
      "regressed",
      "resolved",
    ]);
  });
});
