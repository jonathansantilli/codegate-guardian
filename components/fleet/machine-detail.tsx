"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { severityRank } from "@/lib/security/finding-presentation";
import { API_BASE } from "@/lib/security/fleet-api";
import {
  displayPath,
  formatRelativeTime,
  getHostFreshness,
} from "@/lib/security/fleet-presentation";
import { fetcher } from "@/lib/utils";
import { EvidenceView } from "./evidence-view";
import { Ic } from "./icons";
import { OwnerForm } from "./owner-form";
import {
  Badge,
  Card,
  CardHead,
  FRESHNESS_COLOR,
  FRESHNESS_LABEL,
  FRESHNESS_TONE,
  KV,
  Loading,
  Sev,
  sevColor,
  Tabs,
} from "./ui";

/**
 * One machine, in three views: what it carries, what was found on it, and
 * what it has sent over time.
 *
 * The header is shared by all three, because the question every tab answers
 * starts with the same two facts — which machine, and whose.
 */

export type HostDetail = {
  host: {
    id: string;
    machineId: string;
    hostname: string;
    platform: string | null;
    osRelease: string | null;
    username: string | null;
    owner: string | null;
    team: string | null;
    agentVersion: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
  };
  lastCollectedAt: string | null;
  kbVersion: string | null;
  itemsChecked: number;
  items: {
    tool: string;
    kind: string;
    itemType: string | null;
    scope: string;
    path: string;
    exists: boolean;
    contentHash: string | null;
    riskSurface: string[];
  }[];
  findings: {
    fingerprint: string;
    ruleId: string;
    severity: string;
    description: string;
    filePath: string | null;
    contentHash: string | null;
    evidence: string | null;
    line: number | null;
    column: number | null;
  }[];
  reports: {
    id: string;
    collectedAt: string;
    receivedAt: string;
    itemsTotal: number;
    findingsReported: boolean;
    findingsTotal: number;
    criticalTotal: number;
  }[];
};

/** The agent reports on this cadence; the server never asks it to. */
const REPORT_INTERVAL_HOURS = 6;

export function useHostDetail(hostId: string) {
  return useSWR<HostDetail>(`${API_BASE}/host?hostId=${hostId}`, fetcher, {
    refreshInterval: 30_000,
  });
}

export function MachineHeader({ detail }: { detail: HostDetail }) {
  const { host } = detail;
  const freshness = getHostFreshness(new Date(host.lastSeenAt));
  const critical = detail.findings.filter(
    (f) => f.severity === "CRITICAL"
  ).length;
  const [editingOwner, setEditingOwner] = useState(false);

  return (
    <Card style={{ padding: "16px 18px", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
        <div
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "10px",
            background: "var(--muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--fg2)",
            flexShrink: 0,
          }}
        >
          <Ic name="server" size={19} />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "9px",
              flexWrap: "wrap",
            }}
          >
            <h2 style={{ fontSize: "19px" }}>{host.hostname}</h2>
            <span style={{ fontSize: "13.5px", color: "var(--fg3)" }}>
              {host.owner ?? "Unassigned"}
              {host.team ? ` · ${host.team}` : ""}
            </span>
            <Badge tone={FRESHNESS_TONE[freshness]}>
              {FRESHNESS_LABEL[freshness]}
            </Badge>
            {detail.findings.length > 0 && (
              <Badge tone="crit">
                {detail.findings.length} open
                {critical > 0 ? ` · ${critical} critical` : ""}
              </Badge>
            )}
          </div>
          <span
            className="mono"
            style={{ fontSize: "12px", color: "var(--fg3)" }}
          >
            {host.machineId}
          </span>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(0,1fr))",
          gap: "16px",
        }}
      >
        <KV k="Team" v={host.team ?? "—"} />
        <KV
          k="Owner"
          v={
            <button
              onClick={() => setEditingOwner(true)}
              style={{ textAlign: "left", textDecoration: "underline dotted" }}
              type="button"
            >
              {host.owner ?? "Assign an owner"}
            </button>
          }
        />
        <KV
          k="Platform"
          v={[host.platform, host.osRelease].filter(Boolean).join(" ") || "—"}
        />
        <KV k="Agent" mono v={host.agentVersion ?? "—"} />
        <KV
          k="Enrolled"
          v={new Date(host.firstSeenAt).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        />
        <KV k="Last report" v={formatRelativeTime(new Date(host.lastSeenAt))} />
      </div>
      {editingOwner && (
        <OwnerForm
          hostId={host.id}
          onDone={() => setEditingOwner(false)}
          owner={host.owner}
          team={host.team}
        />
      )}
    </Card>
  );
}

export function MachineTabs({
  detail,
  active,
}: {
  detail: HostDetail;
  active: "inventory" | "findings" | "history";
}) {
  const id = detail.host.id;
  return (
    <Tabs
      tabs={[
        {
          label: "Inventory",
          count: detail.items.length,
          href: `/fleet/machines/${id}`,
          on: active === "inventory",
        },
        {
          label: "Findings",
          count: detail.findings.length,
          href: `/fleet/machines/${id}/report`,
          on: active === "findings",
        },
        {
          label: "History",
          count: detail.reports.length,
          href: `/fleet/machines/${id}/history`,
          on: active === "history",
        },
      ]}
    />
  );
}

/* ---------------------------------------------------------------- *
 * Inventory tab
 * ---------------------------------------------------------------- */

export function MachineInventory({ hostId }: { hostId: string }) {
  const { data: detail, isLoading, error } = useHostDetail(hostId);

  if (isLoading) {
    return <Loading label="Loading machine…" />;
  }
  if (error || !detail) {
    return <Loading label="That machine is not in this console." />;
  }

  // Worst severity recorded against each path, so a row can carry its risk.
  const riskByPath = new Map<string, string>();
  for (const finding of detail.findings) {
    if (!finding.filePath) {
      continue;
    }
    const current = riskByPath.get(finding.filePath);
    if (!current || severityRank(finding.severity) < severityRank(current)) {
      riskByPath.set(finding.filePath, finding.severity);
    }
  }

  const collected = detail.lastCollectedAt
    ? new Date(detail.lastCollectedAt)
    : null;

  return (
    <>
      <MachineHeader detail={detail} />
      <MachineTabs active="inventory" detail={detail} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 336px",
          gap: "16px",
          flex: 1,
          minHeight: 0,
        }}
      >
        <Card grow style={{ overflow: "hidden" }}>
          <CardHead
            note={
              collected
                ? `As of the ${collected.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} report`
                : "No report yet"
            }
            title="Installed AI tooling"
          />
          <div style={{ overflow: "auto", minHeight: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Kind</th>
                  <th>Path</th>
                  <th>Scope</th>
                  <th className="r">Risk</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((item) => {
                  const risk = riskByPath.get(item.path);
                  return (
                    <tr key={`${item.tool}-${item.path}`}>
                      <td>
                        <span className="badge b-out">{item.tool}</span>
                      </td>
                      <td>
                        <span className="badge b-sec">
                          {item.itemType ?? item.kind}
                        </span>
                      </td>
                      <td
                        className="mono trunc"
                        style={{
                          fontSize: "12.5px",
                          maxWidth: "330px",
                          color: "var(--fg2)",
                        }}
                        title={item.path}
                      >
                        {risk ? (
                          <Link
                            href={`/fleet/machines/${hostId}/file?path=${encodeURIComponent(item.path)}`}
                          >
                            {displayPath(item.path, {
                              username: detail.host.username,
                            })}
                          </Link>
                        ) : (
                          displayPath(item.path, {
                            username: detail.host.username,
                          })
                        )}
                      </td>
                      <td style={{ color: "var(--fg3)", fontSize: "12.5px" }}>
                        {item.scope}
                      </td>
                      <td className="r">
                        {risk ? (
                          <Sev
                            label={risk.charAt(0) + risk.slice(1).toLowerCase()}
                            severity={risk}
                          />
                        ) : (
                          <span
                            style={{ color: "var(--fg3)", fontSize: "12.5px" }}
                          >
                            Clean
                          </span>
                        )}
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
              padding: "10px 16px",
              borderTop: "1px solid var(--border)",
              flexShrink: 0,
              fontSize: "11.5px",
              color: "var(--fg3)",
            }}
          >
            {detail.items.length} present of {detail.itemsChecked} paths the
            agent checked. A path a tool could use but does not have is not an
            artifact.
          </div>
        </Card>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            minHeight: 0,
          }}
        >
          <Card>
            <CardHead title="Reporting" />
            <div
              style={{
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <span
                  className="dot"
                  style={{
                    background:
                      FRESHNESS_COLOR[
                        getHostFreshness(new Date(detail.host.lastSeenAt))
                      ],
                  }}
                />
                <span style={{ fontSize: "13px" }}>Last report</span>
                <span
                  className="mono"
                  style={{
                    fontSize: "12px",
                    color: "var(--fg3)",
                    marginLeft: "auto",
                  }}
                >
                  {formatRelativeTime(new Date(detail.host.lastSeenAt))}
                </span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <span className="dot" style={{ background: "var(--fg3)" }} />
                <span style={{ fontSize: "13px" }}>Next expected</span>
                <span
                  className="mono"
                  style={{
                    fontSize: "12px",
                    color: "var(--fg3)",
                    marginLeft: "auto",
                  }}
                >
                  in ~{REPORT_INTERVAL_HOURS} hours
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  padding: "10px 11px",
                  borderRadius: "8px",
                  background: "var(--muted)",
                  fontSize: "12px",
                  color: "var(--fg2)",
                  lineHeight: 1.5,
                }}
              >
                <Ic name="clock" size={14} />
                <span>
                  The agent reports on its own schedule. Nothing is sent to it
                  from here.
                </span>
              </div>
              {detail.kbVersion && (
                <KV k="Content feed" mono v={detail.kbVersion} />
              )}
            </div>
          </Card>

          <Card grow>
            <CardHead title="Report history" />
            <ReportHistory reports={detail.reports.slice(0, 6)} />
          </Card>
        </div>
      </div>
    </>
  );
}

function ReportHistory({ reports }: { reports: HostDetail["reports"] }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "13px",
        overflow: "auto",
      }}
    >
      {reports.length === 0 && (
        <span style={{ fontSize: "12.5px", color: "var(--fg3)" }}>
          Nothing reported yet.
        </span>
      )}
      {reports.map((report, index) => {
        const previous = reports[index + 1];
        const delta = previous ? report.itemsTotal - previous.itemsTotal : 0;

        return (
          <div
            key={report.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "12.5px",
            }}
          >
            <span
              className="mono"
              style={{ color: "var(--fg3)", width: "52px" }}
            >
              {new Date(report.collectedAt).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {/* The stored total counts every path probed, not what was
                found — so it is labelled for what it is. */}
            <span style={{ flex: 1 }}>{report.itemsTotal} paths checked</span>
            {report.criticalTotal > 0 ? (
              <Badge tone="crit">{report.criticalTotal} crit</Badge>
            ) : delta === 0 ? (
              <span style={{ color: "var(--fg3)" }}>no change</span>
            ) : (
              <Badge tone="sec">
                {delta > 0 ? "+" : ""}
                {delta} paths
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * Findings tab — the report as the machine sent it
 * ---------------------------------------------------------------- */

export function MachineReport({ hostId }: { hostId: string }) {
  const { data: detail, isLoading } = useHostDetail(hostId);

  if (isLoading || !detail) {
    return <Loading label="Loading report…" />;
  }

  const bySeverity = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map(
    (severity) => ({
      severity,
      count: detail.findings.filter((f) => f.severity === severity).length,
    })
  );
  const total = detail.findings.length;
  const flagged = new Set(
    detail.findings.map((f) => f.filePath).filter(Boolean)
  ).size;
  const collected = detail.lastCollectedAt
    ? new Date(detail.lastCollectedAt)
    : null;

  return (
    <>
      <MachineTabs active="findings" detail={detail} />

      <Card style={{ padding: "16px 18px", gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <span style={{ fontWeight: 600, fontSize: "15px" }}>
              {detail.host.hostname}
              {collected
                ? ` · report of ${collected.toLocaleString(undefined, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : ""}
            </span>
            <span style={{ fontSize: "12.5px", color: "var(--fg3)" }}>
              {detail.host.owner ?? "Unassigned"}
              {detail.host.team ? ` · ${detail.host.team}` : ""} —{" "}
              {detail.items.length} artifacts · agent{" "}
              {detail.host.agentVersion ?? "unknown"}
              {detail.kbVersion ? ` · content feed ${detail.kbVersion}` : ""}
            </span>
          </div>
        </div>

        {total > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
            <div className="sevbar">
              {bySeverity
                .filter((s) => s.count > 0)
                .map((s) => (
                  <div
                    key={s.severity}
                    style={{
                      width: `${(s.count / total) * 100}%`,
                      background: sevColor(s.severity),
                    }}
                  />
                ))}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "18px",
                fontSize: "12.5px",
                flexWrap: "wrap",
              }}
            >
              {bySeverity.map((s) => (
                <span
                  className="sev"
                  key={s.severity}
                  style={{ color: s.count > 0 ? "var(--fg2)" : "var(--fg3)" }}
                >
                  <span
                    className="dot"
                    style={{ background: sevColor(s.severity) }}
                  />
                  {s.count} {s.severity.toLowerCase()}
                </span>
              ))}
              <span style={{ marginLeft: "auto", color: "var(--fg3)" }}>
                {detail.items.length - flagged} artifacts clean
              </span>
            </div>
          </div>
        )}
      </Card>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          paddingRight: "2px",
        }}
      >
        {total === 0 && (
          <Card style={{ padding: "18px", gap: "6px" }}>
            <span style={{ fontWeight: 500 }}>
              Nothing was found on this machine
            </span>
            <span
              style={{
                fontSize: "13px",
                color: "var(--fg3)",
                lineHeight: 1.55,
              }}
            >
              Its latest scan-carrying report listed no findings. That is an
              assertion the machine made, not an absence of data.
            </span>
          </Card>
        )}

        {detail.findings.map((finding) => (
          <div
            key={finding.fingerprint}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "10px",
              overflow: "hidden",
              background: "var(--card)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "11px 14px",
                borderBottom: "1px solid var(--border)",
                flexWrap: "wrap",
              }}
            >
              <span
                className="dot"
                style={{ background: sevColor(finding.severity) }}
              />
              <span
                className="mono"
                style={{
                  fontSize: "12px",
                  color: sevColor(finding.severity),
                  fontWeight: 500,
                }}
              >
                {finding.ruleId}
              </span>
              <span className="badge b-sec" style={{ fontSize: "11px" }}>
                {finding.severity.charAt(0) +
                  finding.severity.slice(1).toLowerCase()}
              </span>
              <span
                className="mono trunc"
                style={{
                  fontSize: "12px",
                  color: "var(--fg3)",
                  marginLeft: "6px",
                  maxWidth: "300px",
                }}
                title={finding.filePath ?? ""}
              >
                {finding.filePath
                  ? displayPath(finding.filePath, {
                      username: detail.host.username,
                    })
                  : "whole machine"}
              </span>
              {finding.filePath && (
                <Link
                  className="btn xs btn-outline"
                  href={`/fleet/machines/${hostId}/file?path=${encodeURIComponent(finding.filePath)}`}
                  style={{ marginLeft: "auto" }}
                >
                  View the evidence
                </Link>
              )}
            </div>
            <div
              style={{
                padding: "11px 14px",
                display: "flex",
                flexDirection: "column",
                gap: "7px",
              }}
            >
              <span style={{ fontSize: "13px" }}>{finding.description}</span>
              <EvidenceView
                column={finding.column}
                contentHash={finding.contentHash}
                evidence={finding.evidence}
                filePath={finding.filePath}
                line={finding.line}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- *
 * History tab
 * ---------------------------------------------------------------- */

export function MachineHistory({ hostId }: { hostId: string }) {
  const { data: detail, isLoading } = useHostDetail(hostId);

  if (isLoading || !detail) {
    return <Loading label="Loading history…" />;
  }

  return (
    <>
      <MachineTabs active="history" detail={detail} />
      <Card grow style={{ overflow: "hidden" }}>
        <CardHead
          note="Every check-in this machine has made, newest first"
          title="Report history"
        />
        <div style={{ overflow: "auto", minHeight: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Collected</th>
                <th>Received</th>
                <th className="r">Paths checked</th>
                <th className="r">Findings</th>
                <th>Carried findings</th>
              </tr>
            </thead>
            <tbody>
              {detail.reports.map((report) => (
                <tr key={report.id}>
                  <td className="mono" style={{ fontSize: "12.5px" }}>
                    {new Date(report.collectedAt).toLocaleString()}
                  </td>
                  <td
                    className="mono"
                    style={{ fontSize: "12.5px", color: "var(--fg3)" }}
                  >
                    {formatRelativeTime(new Date(report.receivedAt))}
                  </td>
                  <td className="num r">{report.itemsTotal}</td>
                  <td className="num r">
                    {report.findingsReported ? report.findingsTotal : "—"}
                  </td>
                  <td>
                    {report.findingsReported ? (
                      <Badge tone="sec">scan included</Badge>
                    ) : (
                      <span style={{ fontSize: "12.5px", color: "var(--fg3)" }}>
                        inventory only
                      </span>
                    )}
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
