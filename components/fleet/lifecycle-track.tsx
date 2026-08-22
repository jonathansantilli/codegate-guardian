"use client";

import { cn } from "@/lib/utils";
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

export function LifecycleTrack({ status }: { status: FindingStatus }) {
  const at = stepIndexFor(status);
  const done = status === "resolved";

  return (
    <ol className="flex w-full items-start gap-0">
      {STEPS.map((step, index) => (
        <li className="flex min-w-0 flex-1 flex-col gap-1.5" key={step.key}>
          <div className="flex items-center">
            <span
              className={cn(
                "size-3 shrink-0 rounded-full border-2",
                index < at || done
                  ? "border-foreground bg-foreground"
                  : index === at
                    ? "border-foreground bg-background ring-2 ring-foreground/15"
                    : "border-border bg-background"
              )}
            />
            {index < STEPS.length - 1 && (
              <span
                className={cn(
                  "h-0.5 flex-1",
                  index < at || done
                    ? "bg-foreground"
                    : "bg-[repeating-linear-gradient(90deg,var(--color-border)_0_4px,transparent_4px_8px)]"
                )}
              />
            )}
          </div>
          <span
            className={cn(
              "pr-2 text-xs",
              index <= at || done
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
