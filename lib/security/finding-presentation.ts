import type { FindingStatus } from "@/src/application/ports/fleet/fleet-repository";

// Presentation rules for findings, kept out of the component so the severity
// order and the lifecycle vocabulary are stated once and can be tested.

// The order is a domain fact, not a presentation choice — the console shows
// what the domain ranks, and a second list here could disagree with it.
export {
  SEVERITIES as SEVERITY_ORDER,
  type Severity,
  severityRank,
} from "@/src/domain/scan/value-objects/severity";

/**
 * What the console calls each lifecycle state. "Resolved" deliberately reads
 * as something the system observed rather than something a person declared,
 * because that is exactly what it is.
 */
export const STATUS_LABEL: Record<FindingStatus, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  regressed: "Regressed",
};

export function statusExplanation(
  status: FindingStatus,
  lastSeenAt: Date
): string {
  const when = lastSeenAt.toISOString().slice(0, 16).replace("T", " ");

  switch (status) {
    case "resolved":
      return `Confirmed absent in a report after ${when} UTC.`;
    case "acknowledged":
      return "Someone has taken responsibility. It closes when a later report no longer contains it.";
    case "regressed":
      return "This came back after being resolved.";
    default:
      return "Still present in the latest report from at least one machine.";
  }
}

/** Findings a person should look at now: anything a machine still reports. */
export function isOutstanding(status: FindingStatus): boolean {
  return status !== "resolved";
}
