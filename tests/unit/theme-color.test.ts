import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import { resolveThemeColor } from "@/lib/theme-color";

describe("resolveThemeColor", () => {
  test("returns light color when dark mode is false", () => {
    assert.equal(resolveThemeColor(false), "hsl(0 0% 100%)");
  });

  test("returns dark color when dark mode is true", () => {
    assert.equal(resolveThemeColor(true), "hsl(240deg 10% 3.92%)");
  });
});
