export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

export type Severity = (typeof SEVERITIES)[number];

export function isSeverity(value: unknown): value is Severity {
  return (
    typeof value === "string" &&
    (SEVERITIES as readonly string[]).includes(value)
  );
}

export type SeveritySummary = Record<Severity, number>;
