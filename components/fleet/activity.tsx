"use client";

import { useState } from "react";
import useSWR from "swr";
import { API_BASE } from "@/lib/security/fleet-api";
import { formatRelativeTime } from "@/lib/security/fleet-presentation";
import { fetcher } from "@/lib/utils";
import { Ic } from "./icons";
import { Card, CardHead, Empty, Loading } from "./ui";

/**
 * The audit log: who or what did something, and what came of it.
 *
 * Agents and people appear in the same stream deliberately — an operator
 * asking "why did this change" should not have to know which side did it.
 */

type ActivityRecord = {
  id: string;
  occurredAt: string;
  actorKind: "person" | "service" | "agent" | "system";
  actorName: string;
  action: string;
  target: string | null;
  result: string;
  apiCall: string | null;
};

const ACTOR_ICON: Record<ActivityRecord["actorKind"], string> = {
  person: "user",
  agent: "robot",
  service: "bolt",
  system: "bolt",
};

const ACTOR_LABEL: Record<ActivityRecord["actorKind"], string> = {
  person: "Person",
  agent: "Agent",
  service: "Service",
  system: "System",
};

/** A result that reads as a failure gets the critical tone, whatever its text. */
function resultTone(result: string): string {
  const lowered = result.toLowerCase();
  if (
    lowered.startsWith("4") ||
    lowered.startsWith("5") ||
    lowered.includes("rejected") ||
    lowered.includes("failed") ||
    lowered.includes("denied")
  ) {
    return "var(--crit)";
  }
  return "var(--fg2)";
}

type ActorFilter = "all" | ActivityRecord["actorKind"];

const FILTERS: { key: ActorFilter; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "agent", label: "Agents" },
  { key: "person", label: "People" },
  { key: "system", label: "System" },
];

export function ActivityScreen() {
  const { data, isLoading } = useSWR<{ activity: ActivityRecord[] }>(
    `${API_BASE}/activity`,
    fetcher,
    { refreshInterval: 30_000 }
  );
  const [filter, setFilter] = useState<ActorFilter>("all");

  if (isLoading) {
    return <Loading label="Loading activity…" />;
  }

  const activity = data?.activity ?? [];

  if (activity.length === 0) {
    return (
      <Empty
        blurb="Every check-in, acknowledgement, policy change and enrolment is recorded here with the API call behind it. The log fills in as the console is used."
        icon="activity"
        title="No activity yet"
      />
    );
  }

  const counts = FILTERS.map((f) => ({
    ...f,
    count:
      f.key === "all"
        ? activity.length
        : activity.filter((a) => a.actorKind === f.key).length,
  }));

  const visible =
    filter === "all"
      ? activity
      : activity.filter((a) => a.actorKind === filter);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        {counts.map((f) => (
          <button
            className={`chip${filter === f.key ? " on" : ""}`}
            key={f.key}
            onClick={() => setFilter(f.key)}
            type="button"
          >
            {f.label}{" "}
            <span
              className="num"
              style={{ opacity: filter === f.key ? 0.65 : 1 }}
            >
              {f.count}
            </span>
          </button>
        ))}
      </div>

      <Card grow style={{ overflow: "hidden" }}>
        <CardHead
          note="Newest first · every entry names the call behind it"
          title="Activity"
        />
        <div style={{ overflow: "auto", minHeight: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: "150px" }}>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Result</th>
                <th>API call</th>
                <th className="r">When</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "9px",
                      }}
                    >
                      <span style={{ color: "var(--fg3)", display: "flex" }}>
                        <Ic name={ACTOR_ICON[row.actorKind]} size={15} />
                      </span>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          minWidth: 0,
                        }}
                      >
                        <span
                          className="trunc"
                          style={{ fontSize: "13px", fontWeight: 500 }}
                        >
                          {row.actorName}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--fg3)" }}>
                          {ACTOR_LABEL[row.actorKind]}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: "13px" }}>{row.action}</td>
                  <td
                    className="trunc"
                    style={{
                      fontSize: "12.5px",
                      color: "var(--fg3)",
                      maxWidth: "260px",
                    }}
                  >
                    {row.target ?? "—"}
                  </td>
                  <td
                    className="mono"
                    style={{ fontSize: "12px", color: resultTone(row.result) }}
                  >
                    {row.result}
                  </td>
                  <td>
                    {row.apiCall ? (
                      <span className="api">{row.apiCall}</span>
                    ) : (
                      <span style={{ color: "var(--fg3)" }}>—</span>
                    )}
                  </td>
                  <td
                    className="r mono"
                    style={{ fontSize: "12px", color: "var(--fg3)" }}
                  >
                    {formatRelativeTime(new Date(row.occurredAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
