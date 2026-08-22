import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import {
  generateEnrolmentCode,
  isEnrolmentCode,
  normalizeEnrolmentCode,
} from "@/lib/security/enrolment-code";

describe("generateEnrolmentCode", () => {
  test("produces a code in the documented shape", () => {
    assert.match(generateEnrolmentCode(), /^FLEET-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  test("its own output is always accepted", () => {
    for (let i = 0; i < 50; i++) {
      assert.ok(isEnrolmentCode(generateEnrolmentCode()));
    }
  });

  // A code is dictated over a call and typed by hand; characters that are
  // misread in that setting cost more than a longer code would.
  test("omits characters that are misread when spoken or typed", () => {
    const many = Array.from({ length: 200 }, () =>
      generateEnrolmentCode()
    ).join("");
    for (const confusable of ["O", "0", "I", "1", "L"]) {
      assert.ok(!many.replace(/FLEET/g, "").includes(confusable), confusable);
    }
  });

  test("varies between calls", () => {
    const codes = new Set(
      Array.from({ length: 20 }, () => generateEnrolmentCode())
    );
    assert.ok(codes.size > 1);
  });
});

describe("normalizeEnrolmentCode", () => {
  test("accepts what a person actually types", () => {
    assert.equal(
      normalizeEnrolmentCode("  fleet-7k2m-9xq4 "),
      "FLEET-7K2M-9XQ4"
    );
  });

  test("strips spaces inside the code", () => {
    assert.equal(
      normalizeEnrolmentCode("FLEET- 7K2M -9XQ4"),
      "FLEET-7K2M-9XQ4"
    );
  });
});

describe("isEnrolmentCode", () => {
  test("accepts a well-formed code in any case", () => {
    assert.ok(isEnrolmentCode("fleet-7k2m-9xq4"));
  });

  test("rejects a malformed one", () => {
    for (const bad of [
      "FLEET-7K2M",
      "7K2M-9XQ4",
      "FLEET-7K2M-9XQ44",
      "",
      "FLEET-0OIL-9XQ4",
    ]) {
      assert.equal(isEnrolmentCode(bad), false, bad);
    }
  });
});
