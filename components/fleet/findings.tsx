"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";
import {
  isOutstanding,
  STATUS_LABEL,
  severityRank,
  statusExplanation,
} from "@/lib/security/finding-presentation";
import { formatRelativeTime } from "@/lib/security/fleet-presentation";
import { fetcher } from "@/lib/utils";
import type { FindingStatus } from "@/src/application/ports/fleet/fleet-repository";
import { EvidenceView } from "./evidence-view";
import { Ic } from "./icons";
import { LifecycleTrack } from "./lifecycle-track";
import { Badge, Card, CardHead, Empty, KV, Loading, Sev, sevColor } from "./ui";

/**
 * Findings triage: the whole list on the left, one finding in full on the
 * right.
 *
 * Status is derived from what machines reported and is never stored, so
 * nothing here has a "mark as done" — the only mutable bit is an
 * acknowledgement, which records that a person took responsibility.
 */

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Finding = {
  fingerprint: string;
  ruleId: string;
  severity: string;
  description: string;
  filePath: string | null;
  contentHash: string | null;
  status: FindingStatus;
  machineCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  evidence: string | null;
  line: number | null;
  column: number | null;
};

type Attention = {
  hostId: string;
  hostname: string;
  owner: string | null;
  team: string | null;
  fingerprint: string;
  lastSeenAt: string;
};

type Host = { host: { id: string; hostname: string; lastSeenAt: string } };

type StatusFilter = "all" | FindingStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "regressed", label: "Regressed" },
  { key: "resolved", label: "Resolved" },
];

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export function FindingsScreen() {
  const { data, isLoading } = useSWR<{ findings: Finding[] }>(
    `${base}/api/fleet/findings`,
    fetcher,
    { refreshInterval: 30_000 }
  );
  const { data: attentionData } = useSWR<{ attention: Attention[] }>(
    `${base}/api/fleet/attention`,
    fetcher
  );
  const { data: hostData } = useSWR<{ hosts: Host[] }>(
    `${base}/api/fleet`,
    fetcher
  );

  const [status, setStatus] = useState<StatusFilter | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  if (isLoading) {
    return <Loading label="Loading findings…" />;
  }

  const findings = [...(data?.findings ?? [])].sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
  );
  const outstanding = findings.filter((f) => isOutstanding(f.status));

  // Nothing outstanding is good news, not an empty database — so the screen
  // opens on what did close rather than pretending there is nothing to see.
  const filter = status ?? (outstanding.length > 0 ? "open" : "resolved");

  if (findings.length === 0) {
    const hosts = hostData?.hosts ?? [];
    const newest = hosts
      .map((h) => new Date(h.host.lastSeenAt).getTime())
      .sort((a, b) => b - a)[0];

    return (
      <Empty
        blurb={
          hosts.length === 0
            ? "No machine has reported yet, so there is nothing to check. A finding appears here the first time a machine reports one."
            : `${hosts.length} machine${hosts.length === 1 ? "" : "s"} reporting. Nothing on the fleet matches a known-bad indicator or breaks a policy.`
        }
        extra={
          newest ? (
            <span style={{ fontSize: "12.5px", color: "var(--fg3)" }}>
              Last check-in {formatRelativeTime(new Date(newest))}
            </span>
          ) : undefined
        }
        icon="policies"
        title="No open findings"
        tone="clear"
      />
    );
  }

  const statusCounts = STATUS_FILTERS.map((f) => ({
    ...f,
    count:
      f.key === "all"
        ? findings.length
        : findings.filter((x) => x.status === f.key).length,
  }));

  const visible = findings
    .filter((f) => filter === "all" || f.status === filter)
    .filter((f) => !severity || f.severity === severity);

  const current =
    visible.find((f) => f.fingerprint === selected) ?? visible[0] ?? null;

  const presentOn = (attentionData?.attention ?? []).filter(
    (row) => row.fingerprint === current?.fingerprint
  );

  async function acknowledge(finding: Finding, hostId: string) {
    const response = await fetch(`${base}/api/fleet/acknowledge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hostId, fingerprint: finding.fingerprint }),
    });

    if (response.ok) {
      toast.success(
        "Acknowledged. It closes when a later report no longer carries it."
      );
      mutate(`${base}/api/fleet/findings`);
    } else {
      toast.error("Could not record the acknowledgement.");
    }
  }

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
        {statusCounts.map((f) => (
          <button
            className={`chip${filter === f.key ? " on" : ""}`}
            key={f.key}
            onClick={() => setStatus(f.key)}
            type="button"
          >
            {f.label}{" "}
            <span
              className="num"
              style={{ opacity: status === f.key ? 0.65 : 1 }}
            >
              {f.count}
            </span>
          </button>
        ))}
        <div
          style={{
            width: "1px",
            height: "20px",
            background: "var(--border)",
            margin: "0 2px",
          }}
        />
        {SEVERITIES.map((sev) => {
          const count = findings.filter((f) => f.severity === sev).length;
          if (count === 0) {
            return null;
          }
          return (
            <button
              className={`chip${severity === sev ? " on" : ""}`}
              key={sev}
              onClick={() => setSeverity(severity === sev ? null : sev)}
              type="button"
            >
              <span className="dot" style={{ background: sevColor(sev) }} />
              {sev.charAt(0) + sev.slice(1).toLowerCase()}{" "}
              <span
                className="num"
                style={{ opacity: severity === sev ? 0.65 : 1 }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {outstanding.length === 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "11px 15px",
            borderRadius: "10px",
            border: "1px solid color-mix(in oklch, var(--ok) 30%, transparent)",
            background: "var(--ok-bg)",
            flexShrink: 0,
          }}
        >
          <span className="dot" style={{ background: "var(--ok)" }} />
          <span style={{ fontSize: "13px", color: "var(--fg2)" }}>
            <b style={{ fontWeight: 600 }}>Nothing is outstanding.</b> Every
            finding below was confirmed absent in a later report — the report is
            the evidence, so none of them was closed by hand.
          </span>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "352px minmax(0,1fr)",
          gap: "16px",
          flex: 1,
          minHeight: 0,
        }}
      >
        <Card grow style={{ overflow: "hidden" }}>
          <CardHead
            badge={<Badge tone="sec">{visible.length}</Badge>}
            title={
              filter === "all"
                ? "All findings"
                : `${STATUS_FILTERS.find((f) => f.key === filter)?.label} findings`
            }
          />
          <div style={{ overflow: "auto", minHeight: 0 }}>
            {visible.length === 0 && (
              <p
                style={{
                  padding: "16px",
                  fontSize: "12.5px",
                  color: "var(--fg3)",
                }}
              >
                Nothing matches these filters.
              </p>
            )}
            {visible.map((finding) => {
              const on = finding.fingerprint === current?.fingerprint;
              return (
                <button
                  className="rowbtn"
                  key={finding.fingerprint}
                  onClick={() => setSelected(finding.fingerprint)}
                  style={{
                    display: "flex",
                    gap: "11px",
                    padding: "12px 14px",
                    borderBottom:
                      "1px solid color-mix(in oklch, var(--border) 55%, transparent)",
                    ...(on ? { background: "var(--muted)" } : {}),
                  }}
                  type="button"
                >
                  <span
                    className="dot"
                    style={{
                      background: sevColor(finding.severity),
                      marginTop: "6px",
                    }}
                  />
                  <span
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "3px",
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    <span
                      className="mono trunc"
                      style={{ fontSize: "12px", color: "var(--fg3)" }}
                    >
                      {finding.ruleId}
                    </span>
                    <span
                      className="trunc"
                      style={{ fontSize: "13px", fontWeight: 500 }}
                    >
                      {finding.description}
                    </span>
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginTop: "2px",
                      }}
                    >
                      <span
                        className="badge b-sec"
                        style={{ fontSize: "11px" }}
                      >
                        {STATUS_LABEL[finding.status]}
                      </span>
                      <span style={{ fontSize: "11.5px", color: "var(--fg3)" }}>
                        {finding.machineCount} machine
                        {finding.machineCount === 1 ? "" : "s"}
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: "11.5px",
                          color: "var(--fg3)",
                          marginLeft: "auto",
                        }}
                      >
                        {formatRelativeTime(
                          new Date(finding.lastSeenAt)
                        ).replace(" ago", "")}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        {current && (
          <Card grow style={{ overflow: "hidden" }}>
            <div className="card-h">
              <span
                className="dot"
                style={{ background: sevColor(current.severity) }}
              />
              <h3>{current.description}</h3>
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {presentOn[0] && (
                  <Link
                    className="btn sm btn-primary"
                    href={
                      current.filePath
                        ? `/fleet/machines/${presentOn[0].hostId}/file?path=${encodeURIComponent(current.filePath)}`
                        : `/fleet/machines/${presentOn[0].hostId}/report`
                    }
                  >
                    <Ic name="findings" size={14} /> Open the evidence
                  </Link>
                )}
              </div>
            </div>

            <div
              style={{
                padding: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "18px",
                overflow: "auto",
                minHeight: 0,
              }}
            >
              <div
                style={{
                  padding: "16px 16px 14px",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  background: "var(--muted)",
                }}
              >
                <LifecycleTrack status={current.status} />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                    marginTop: "14px",
                    paddingTop: "12px",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <Ic name="clock" size={14} />
                  <span style={{ fontSize: "12.5px", color: "var(--fg2)" }}>
                    {statusExplanation(
                      current.status,
                      new Date(current.lastSeenAt)
                    )}
                    {current.status !== "resolved" &&
                      " The report is the evidence, so nothing here needs marking done by hand."}
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0,1fr))",
                  gap: "16px",
                }}
              >
                <KV k="Rule" mono v={current.ruleId} />
                <KV
                  k="Severity"
                  v={
                    <Sev
                      label={
                        current.severity.charAt(0) +
                        current.severity.slice(1).toLowerCase()
                      }
                      severity={current.severity}
                    />
                  }
                />
                <KV k="Machines" v={current.machineCount} />
                <KV
                  k="First seen"
                  v={formatRelativeTime(new Date(current.firstSeenAt))}
                />
              </div>

              {current.evidence && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11.5px",
                      fontWeight: 500,
                      letterSpacing: ".05em",
                      textTransform: "uppercase",
                      color: "var(--fg3)",
                    }}
                  >
                    Evidence
                  </span>
                  <EvidenceView
                    column={current.column}
                    contentHash={current.contentHash}
                    evidence={current.evidence}
                    filePath={current.filePath}
                    line={current.line}
                  />
                </div>
              )}

              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                <span
                  style={{
                    fontSize: "11.5px",
                    fontWeight: 500,
                    letterSpacing: ".05em",
                    textTransform: "uppercase",
                    color: "var(--fg3)",
                  }}
                >
                  Present on
                </span>
                {presentOn.length === 0 ? (
                  <span style={{ fontSize: "12.5px", color: "var(--fg3)" }}>
                    No machine's latest report still carries this.
                  </span>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      border: "1px solid var(--border)",
                      borderRadius: "9px",
                      overflow: "hidden",
                    }}
                  >
                    {presentOn.map((row, index) => (
                      <div
                        key={row.hostId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 13px",
                          background: "var(--card)",
                          ...(index > 0
                            ? { borderTop: "1px solid var(--border)" }
                            : {}),
                        }}
                      >
                        <Ic name="server" size={15} />
                        <Link
                          href={`/fleet/machines/${row.hostId}`}
                          style={{ fontWeight: 500, fontSize: "13px" }}
                        >
                          {row.hostname}
                        </Link>
                        <span
                          className="mono trunc"
                          style={{ fontSize: "11.5px", color: "var(--fg3)" }}
                        >
                          {row.owner ?? "Unassigned"} ·{" "}
                          {formatRelativeTime(new Date(row.lastSeenAt))}
                        </span>
                        {current.acknowledgedBy ? (
                          <Badge tone="sec">
                            Acknowledged by {current.acknowledgedBy}
                          </Badge>
                        ) : (
                          <button
                            className="btn xs btn-outline"
                            onClick={() => acknowledge(current, row.hostId)}
                            style={{ marginLeft: "auto" }}
                            type="button"
                          >
                            Acknowledge
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
