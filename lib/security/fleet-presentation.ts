// Pure presentation rules for the fleet view. Kept out of the component so
// the staleness thresholds are testable and stated once.

export const STALE_AFTER_HOURS = 24;
export const OFFLINE_AFTER_HOURS = 24 * 7;

export type HostFreshness = "online" | "stale" | "offline";

export function getHostFreshness(
  lastSeenAt: Date,
  now: Date = new Date()
): HostFreshness {
  const hoursSince = (now.getTime() - lastSeenAt.getTime()) / 3_600_000;

  if (hoursSince >= OFFLINE_AFTER_HOURS) {
    return "offline";
  }
  if (hoursSince >= STALE_AFTER_HOURS) {
    return "stale";
  }
  return "online";
}

export function formatRelativeTime(
  value: Date,
  now: Date = new Date()
): string {
  const seconds = Math.round((now.getTime() - value.getTime()) / 1000);

  if (seconds < 60) {
    return "just now";
  }

  const units: [label: string, seconds: number][] = [
    ["d", 86_400],
    ["h", 3600],
    ["m", 60],
  ];

  for (const [label, unitSeconds] of units) {
    if (seconds >= unitSeconds) {
      return `${Math.floor(seconds / unitSeconds)}${label} ago`;
    }
  }

  return "just now";
}
