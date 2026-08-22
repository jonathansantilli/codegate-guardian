import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import {
  csvField,
  exportFilename,
  isExportFormat,
  isExportKind,
  toCsv,
} from "@/lib/security/fleet-export";

describe("csvField", () => {
  test("leaves an ordinary value alone", () => {
    assert.equal(csvField("dev-laptop-01"), "dev-laptop-01");
  });

  test("quotes a value containing a comma", () => {
    assert.equal(csvField("Santilli, Jonathan"), '"Santilli, Jonathan"');
  });

  test("doubles an embedded quote", () => {
    assert.equal(csvField('he said "no"'), '"he said ""no"""');
  });

  test("quotes a value containing a newline", () => {
    assert.equal(csvField("line one\nline two"), '"line one\nline two"');
  });

  test("neutralises a leading = so a hostname cannot become a formula", () => {
    assert.equal(csvField("=cmd|'/c calc'!A0"), "'=cmd|'/c calc'!A0");
  });

  test("neutralises the other formula triggers too", () => {
    for (const trigger of ["+", "-", "@"]) {
      assert.equal(csvField(`${trigger}SUM(A1)`), `'${trigger}SUM(A1)`);
    }
  });

  test("neutralises and quotes when a value needs both", () => {
    // The apostrophe goes on first, then the whole field is quoted, so the
    // cell a spreadsheet reads back is the inert text and not a formula.
    assert.equal(csvField('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  });

  test("renders a date as an unambiguous instant", () => {
    assert.equal(
      csvField(new Date("2026-08-22T12:04:00.000Z")),
      "2026-08-22T12:04:00.000Z"
    );
  });

  test("renders null and undefined as empty rather than as words", () => {
    assert.equal(csvField(null), "");
    assert.equal(csvField(undefined), "");
  });
});

describe("toCsv", () => {
  test("writes a header from the first row and one line per row", () => {
    const csv = toCsv([
      { hostname: "a", owner: "Ann" },
      { hostname: "b", owner: null },
    ]);
    assert.equal(csv, "hostname,owner\na,Ann\nb,\n");
  });

  test("returns nothing at all for no rows", () => {
    assert.equal(toCsv([]), "");
  });
});

describe("export parameters", () => {
  test("accepts only the kinds the console offers", () => {
    assert.ok(isExportKind("findings"));
    assert.ok(!isExportKind("passwords"));
  });

  test("accepts only the formats the console writes", () => {
    assert.ok(isExportFormat("csv"));
    assert.ok(!isExportFormat("xlsx"));
  });

  test("names the file for what it holds and when it was taken", () => {
    assert.equal(
      exportFilename("machines", "csv", new Date("2026-08-22T18:00:00Z")),
      "guardian-machines-2026-08-22.csv"
    );
  });
});
