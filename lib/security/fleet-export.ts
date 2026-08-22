/**
 * Turning what the console shows into something you can take away.
 *
 * The console is a client of the same API an agent or a script uses, so
 * export is a route rather than a browser-side download: the same URL an
 * operator clicks is the one a cron job curls.
 */

export const EXPORT_KINDS = [
  "machines",
  "findings",
  "inventory",
  "activity",
] as const;

export type ExportKind = (typeof EXPORT_KINDS)[number];

export const EXPORT_FORMATS = ["json", "csv"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function isExportKind(value: string): value is ExportKind {
  return (EXPORT_KINDS as readonly string[]).includes(value);
}

export function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}

/**
 * Escapes one CSV field.
 *
 * Quotes wrap anything containing a delimiter, a quote or a newline, and an
 * embedded quote is doubled — the rule every spreadsheet agrees on. A leading
 * `=`, `+`, `-` or `@` is prefixed with a quote as well: without it a
 * hostname a machine chose for itself becomes a formula when the file is
 * opened, which is someone else's code running in your spreadsheet.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  let text = value instanceof Date ? value.toISOString() : String(value);

  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** A CSV document from uniform rows. Column order follows the first row. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return "";
  }
  const columns = Object.keys(rows[0]);
  const lines = [columns.map(csvField).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvField(row[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/** `guardian-findings-2026-08-22.csv` — sorts and reads well in a downloads folder. */
export function exportFilename(
  kind: ExportKind,
  format: ExportFormat,
  now: Date
): string {
  return `guardian-${kind}-${now.toISOString().slice(0, 10)}.${format}`;
}
