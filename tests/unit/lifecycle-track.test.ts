import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import { stepIndexFor } from "@/components/fleet/lifecycle-track";

describe("stepIndexFor", () => {
  test("an open finding sits at detection", () => {
    assert.equal(stepIndexFor("open"), 0);
  });

  test("acknowledging advances one step and no further", () => {
    assert.equal(stepIndexFor("acknowledged"), 1);
  });

  // Resolution is the end of the track, and only a report can get it there.
  test("resolved is the final step", () => {
    assert.equal(stepIndexFor("resolved"), 3);
  });

  test("a regression starts the track again", () => {
    assert.equal(stepIndexFor("regressed"), 0);
  });
});
