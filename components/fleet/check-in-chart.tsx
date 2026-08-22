/**
 * Check-ins per hour over the last day.
 *
 * Hand-drawn SVG rather than a charting library: it is one series of at most
 * 24 points, and the design fixes its shape — a 2px line, a 5% fill under it
 * and a marked peak.
 */

const VIEW_W = 620;
const VIEW_H = 120;
const BASELINE = 119;
const TOP = 26;

export type CheckInPoint = { hour: string; count: number };

/**
 * Maps counts onto the design's drawing box.
 *
 * Every hour of the window is plotted, including the ones with no check-ins:
 * a gap in reporting is exactly what this chart exists to show, and skipping
 * empty hours would draw straight over it.
 */
export function toPath(
  points: CheckInPoint[],
  hours = 24,
  now: Date = new Date()
): { line: string; area: string; peak: { x: number; y: number } | null } {
  if (points.length === 0) {
    return { line: "", area: "", peak: null };
  }

  const byHour = new Map(
    points.map((p) => [new Date(p.hour).toISOString().slice(0, 13), p.count])
  );
  // The right edge is now, not the last hour that happened to have data.
  // Anchoring to the newest bucket drew a fleet that went silent six hours
  // ago as healthy right up to the tick labelled "now", and pushed six empty
  // hours onto the left — cropping the outage the chart exists to show.
  const newest = now;

  const series: number[] = [];
  for (let i = hours - 1; i >= 0; i--) {
    const at = new Date(newest.getTime() - i * 60 * 60 * 1000);
    series.push(byHour.get(at.toISOString().slice(0, 13)) ?? 0);
  }

  const max = Math.max(...series, 1);
  const step = series.length > 1 ? VIEW_W / (series.length - 1) : VIEW_W;
  const y = (count: number) => BASELINE - (count / max) * (BASELINE - TOP);

  const coords = series.map((count, i) => ({
    x: Math.round(i * step),
    y: y(count),
  }));
  const line = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x} ${c.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${VIEW_W} ${BASELINE} L0 ${BASELINE} Z`;

  const peakIndex = series.indexOf(max);
  return { line, area, peak: max > 0 ? coords[peakIndex] : null };
}

export function CheckInChart({
  points,
  now,
}: {
  points: CheckInPoint[];
  now?: Date;
}) {
  const { line, area, peak } = toPath(points, 24, now);
  const total = points.reduce((sum, p) => sum + p.count, 0);

  if (total === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontSize: "13px",
          color: "var(--fg3)",
          textAlign: "center",
        }}
      >
        No check-ins in the last 24 hours.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "16px 16px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        minHeight: 0,
      }}
    >
      <svg
        aria-label={`Check-ins per hour over the last 24 hours. ${total} in total.`}
        role="img"
        style={{ width: "100%", height: `${VIEW_H}px`, display: "block" }}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      >
        <g stroke="var(--border)" strokeWidth="1">
          <line x1="0" x2={VIEW_W} y1="30" y2="30" />
          <line x1="0" x2={VIEW_W} y1="60" y2="60" />
          <line x1="0" x2={VIEW_W} y1="90" y2="90" />
          <line x1="0" x2={VIEW_W} y1={BASELINE} y2={BASELINE} />
        </g>
        <path d={area} fill="var(--fg)" opacity="0.05" />
        <path
          d={line}
          fill="none"
          stroke="var(--fg)"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        {peak && <circle cx={peak.x} cy={peak.y} fill="var(--fg)" r="3.5" />}
      </svg>
      <div
        className="mono"
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "11.5px",
          color: "var(--fg3)",
        }}
      >
        <span>24h ago</span>
        <span>18h</span>
        <span>12h</span>
        <span>6h</span>
        <span>now</span>
      </div>
    </div>
  );
}
