"use client";

import type { FindingStatus } from "@/src/application/ports/fleet/fleet-repository";

/**
 * Where a finding is in its life.
 *
 * The final step is reached by the system observing a later report, not by
 * anyone declaring it done — so the track is drawn as something that advances
 * on its own, and the pending leg is dashed to say the wait is a real state.
 */

const STEPS: { key: string; label: string }[] = [
  { key: "detected", label: "Detected" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "awaiting", label: "Awaiting next report" },
  { key: "resolved", label: "Resolved" },
];

export function stepIndexFor(status: FindingStatus): number {
  switch (status) {
    case "resolved":
      return 3;
    case "acknowledged":
      return 1;
    case "regressed":
      return 0;
    default:
      return 0;
  }
}

/** Where the wait is: the leg after this step is drawn dashed, not solid. */
const WAITING_STEP = 2;

export function LifecycleTrack({ status }: { status: FindingStatus }) {
  const at = stepIndexFor(status);
  const done = status === "resolved";

  return (
    <ol className="lc">
      {STEPS.map((step, index) => {
        const reached = index < at || done;
        const now = index === at && !done;
        const state =
          done && index === STEPS.length - 1
            ? "ok"
            : reached
              ? "done"
              : now
                ? "now"
                : index === WAITING_STEP
                  ? "wait todo"
                  : "todo";

        return (
          <li className={`lc-step ${state}`} key={step.key}>
            <div className="lc-track">
              <span className="lc-node" />
              {index < STEPS.length - 1 && <span className="lc-line" />}
            </div>
            <span className="lc-lab">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
