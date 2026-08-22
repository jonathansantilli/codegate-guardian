import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import {
  countHiddenCharacters,
  revealHidden,
} from "@/components/fleet/evidence-view";

describe("countHiddenCharacters", () => {
  test("counts every zero-width character", () => {
    assert.equal(countHiddenCharacters("a​b‌c‍d⁠e﻿"), 5);
  });

  test("reports none for ordinary text", () => {
    assert.equal(countHiddenCharacters("follow the team conventions"), 0);
  });
});

describe("revealHidden", () => {
  // The whole attack is that a reviewer sees nothing wrong; the console has to
  // draw what the eye cannot catch.
  test("names each invisible character by codepoint", () => {
    const parts = revealHidden("Follow the​‌ rules");
    assert.deepEqual(
      parts.filter((p) => p.hidden).map((p) => p.text),
      ["U+200B", "U+200C"]
    );
  });

  test("keeps the visible text intact and in order", () => {
    const parts = revealHidden("ab​cd");
    assert.deepEqual(
      parts.map((p) => p.text),
      ["ab", "U+200B", "cd"]
    );
  });

  test("returns one plain run when nothing is hidden", () => {
    assert.deepEqual(revealHidden("plain"), [{ text: "plain", hidden: false }]);
  });

  test("handles a line that is only hidden characters", () => {
    const parts = revealHidden("​⁠");
    assert.ok(parts.every((p) => p.hidden));
    assert.equal(parts.length, 2);
  });

  test("handles an empty line", () => {
    assert.deepEqual(revealHidden(""), []);
  });
});
