/**
 * Severities, worst first. The order is the value: everything that sorts,
 * ranks or filters findings derives from this array rather than restating it,
 * because a second copy that disagrees silently reorders a triage queue.
 */
export const SEVERITIES = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
] as const;

export type Severity = (typeof SEVERITIES)[number];

export function isSeverity(value: unknown): value is Severity {
  return (
    typeof value === "string" &&
    (SEVERITIES as readonly string[]).includes(value)
  );
}

export type SeveritySummary = Record<Severity, number>;

/** Worst first. An unrecognised severity sorts last, never first. */
export function severityRank(severity: string): number {
  const index = (SEVERITIES as readonly string[]).indexOf(
    severity.toUpperCase()
  );
  return index === -1 ? SEVERITIES.length : index;
}
