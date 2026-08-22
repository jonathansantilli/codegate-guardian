"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { severityRank } from "@/lib/security/finding-presentation";
import { API_BASE } from "@/lib/security/fleet-api";
import {
  formatRelativeTime,
  getHostFreshness,
  type HostFreshness,
} from "@/lib/security/fleet-presentation";
import { fetcher } from "@/lib/utils";
import { Ic } from "./icons";
import {
  Avatar,
  Badge,
  Card,
  Code,
  Empty,
  Loading,
  machineStatus,
  Sev,
} from "./ui";

/**
 * Every machine running the agent, and the person accountable for it.
 *
 * The machine is the system of record, so this is the screen everything else
 * hangs off: a row leads to what that machine reported, not to an abstract
 * artifact shared across the fleet.
 */

type HostSummary = {
  host: {
    id: string;
    hostname: string;
    platform: string | null;
    owner: string | null;
    team: string | null;
    agentVersion: string | null;
    lastSeenAt: string;
    revokedAt: string | null;
  };
  itemsTotal: number;
  toolNames: string[];
  lastCollectedAt: string | null;
};

type Attention = { hostId: string; severity: string };

type Filter = "all" | HostFreshness | "revoked";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "online", label: "Reporting" },
  { key: "stale", label: "Stale" },
  { key: "offline", label: "No recent reports" },
  { key: "revoked", label: "Revoked" },
];

/** Rows per page. Enough to work through, few enough to scan. */
const PAGE_SIZE = 25;

/** Which filter a machine belongs to. Revocation wins over silence. */
function bucketOf(entry: HostSummary): Exclude<Filter, "all"> {
  return entry.host.revokedAt
    ? "revoked"
    : getHostFreshness(new Date(entry.host.lastSeenAt));
}

export function MachinesScreen() {
  const router = useRouter();
  const { data, isLoading } = useSWR<{ hosts: HostSummary[] }>(
    `${API_BASE}`,
    fetcher,
    { refreshInterval: 30_000 }
  );
  const { data: attentionData } = useSWR<{ attention: Attention[] }>(
    `${API_BASE}/attention`,
    fetcher
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  if (isLoading) {
    return <Loading label="Loading machines…" />;
  }

  const hosts = data?.hosts ?? [];

  if (hosts.length === 0) {
    return (
      <Empty
        actions={
          <Link className="btn btn-primary" href="/fleet/access">
            Generate enrolment code
          </Link>
        }
        blurb="A machine appears here the moment its agent checks in for the first time. Enrolling one takes a single command."
        extra={
          <div style={{ marginTop: "8px", textAlign: "left", width: "100%" }}>
            <Code>
              {"npx codegate-ai enrol --server "}
              <span className="kw">https://guardian.example.internal</span>
              {" --code "}
              <span className="kw">FLEET-XXXX-XXXX</span>
            </Code>
          </div>
        }
        icon="machines"
        title="No machines enrolled yet"
      />
    );
  }

  // Worst severity per machine, so a row can say what is wrong at a glance.
  const bySeverity = new Map<string, string[]>();
  for (const row of attentionData?.attention ?? []) {
    bySeverity.set(row.hostId, [
      ...(bySeverity.get(row.hostId) ?? []),
      row.severity,
    ]);
  }

  const counts = FILTERS.map((f) => ({
    ...f,
    count:
      f.key === "all"
        ? hosts.length
        : hosts.filter((h) => bucketOf(h) === f.key).length,
  }));

  const needle = query.trim().toLowerCase();
  const matching = hosts.filter((entry) => {
    if (filter !== "all" && bucketOf(entry) !== filter) {
      return false;
    }
    if (!needle) {
      return true;
    }
    return `${entry.host.hostname} ${entry.host.owner ?? ""} ${entry.host.team ?? ""}`
      .toLowerCase()
      .includes(needle);
  });

  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = matching.slice(
    current * PAGE_SIZE,
    (current + 1) * PAGE_SIZE
  );

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
        <label className="input" style={{ width: "260px" }}>
          <Ic name="search" size={14} />
          <input
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Filter by hostname or owner"
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: "none",
              background: "none",
              color: "var(--fg)",
              font: "inherit",
              padding: 0,
            }}
            value={query}
          />
        </label>
        {counts.map((f) => (
          <button
            className={`chip${filter === f.key ? " on" : ""}`}
            key={f.key}
            onClick={() => {
              setFilter(f.key);
              setPage(0);
            }}
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
        <div style={{ overflow: "auto", minHeight: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Machine &amp; owner</th>
                <th>Status</th>
                <th>Agent</th>
                <th>Tools</th>
                <th className="r">Artifacts</th>
                <th className="r">Open findings</th>
                <th className="r">Last report</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => {
                const status = machineStatus(
                  getHostFreshness(new Date(entry.host.lastSeenAt)),
                  entry.host.revokedAt,
                  entry.lastCollectedAt
                );
                const severities = bySeverity.get(entry.host.id) ?? [];
                const worst = [...severities].sort(
                  (a, b) => severityRank(a) - severityRank(b)
                )[0];

                return (
                  <tr
                    className="link"
                    key={entry.host.id}
                    onClick={() =>
                      router.push(`/fleet/machines/${entry.host.id}`)
                    }
                  >
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <Avatar
                          name={entry.host.owner ?? entry.host.hostname}
                          size={28}
                        />
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "1px",
                            minWidth: 0,
                          }}
                        >
                          <span style={{ fontWeight: 500 }}>
                            {entry.lastCollectedAt === null
                              ? "Awaiting first report"
                              : entry.host.hostname}
                          </span>
                          <span
                            className="trunc"
                            style={{
                              fontSize: "11.5px",
                              color: "var(--fg3)",
                              maxWidth: "210px",
                            }}
                          >
                            {entry.host.owner ?? "Unassigned"}
                            {entry.host.team ? ` · ${entry.host.team}` : ""}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td
                      className="mono"
                      style={{ fontSize: "12.5px", color: "var(--fg2)" }}
                    >
                      {entry.host.agentVersion ?? "—"}
                      {entry.host.platform ? ` · ${entry.host.platform}` : ""}
                    </td>
                    <td>
                      {entry.toolNames.map((tool) => (
                        <span
                          className="badge b-out"
                          key={tool}
                          style={{ marginRight: "4px" }}
                        >
                          {tool}
                        </span>
                      ))}
                    </td>
                    <td className="num r" style={{ color: "var(--fg2)" }}>
                      {entry.itemsTotal}
                    </td>
                    <td className="num r">
                      {severities.length === 0 ? (
                        <span style={{ color: "var(--fg3)" }}>—</span>
                      ) : (
                        <Sev
                          label={`${severities.length} ${worst.toLowerCase()}`}
                          severity={worst}
                        />
                      )}
                    </td>
                    <td
                      className="num r mono"
                      style={{ fontSize: "12.5px", color: "var(--fg3)" }}
                    >
                      {formatRelativeTime(new Date(entry.host.lastSeenAt))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "10px 16px",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "12.5px", color: "var(--fg3)" }}>
            Showing {matching.length === 0 ? 0 : current * PAGE_SIZE + 1}–
            {current * PAGE_SIZE + visible.length} of {matching.length}
            {matching.length === hosts.length
              ? ""
              : ` (${hosts.length} enrolled)`}
          </span>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <button
              className="btn xs btn-outline"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
              type="button"
            >
              Previous
            </button>
            <button
              className="btn xs btn-outline"
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </Card>
    </>
  );
}
