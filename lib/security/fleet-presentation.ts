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

/** How many trailing path segments carry enough to recognise a file. */
const PATH_SEGMENTS = 3;

/**
 * A file path as it should be read.
 *
 * The identifying half of an artifact path is its tail — `…/skills/podcast/
 * SKILL.md` says what the file is, while the first forty characters are the
 * same home directory on every row. Truncating from the end, as CSS ellipsis
 * does, throws away the only part worth showing.
 *
 * A home directory is collapsed to `~` when the owning user is known, which
 * is how the path reads on the machine itself.
 */
export function displayPath(
  path: string,
  options: { username?: string | null; segments?: number } = {}
): string {
  const segments = options.segments ?? PATH_SEGMENTS;

  let shown = path;
  if (options.username) {
    // macOS reports /Users/<name>, Linux /home/<name>.
    shown = shown.replace(
      new RegExp(
        `^(/private)?/(Users|home)/${escapeForRegExp(options.username)}(?=/|$)`
      ),
      "~"
    );
  }

  if (shown.startsWith("~")) {
    return shown;
  }

  const parts = shown.split("/").filter(Boolean);
  return parts.length <= segments
    ? shown
    : `…/${parts.slice(-segments).join("/")}`;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
