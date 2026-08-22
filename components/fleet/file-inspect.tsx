"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { shortHash } from "@/lib/security/artifact-presentation";
import { severityRank } from "@/lib/security/finding-presentation";
import {
  displayPath,
  formatRelativeTime,
} from "@/lib/security/fleet-presentation";
import { fetcher } from "@/lib/utils";
import { EvidenceView } from "./evidence-view";
import { Ic } from "./icons";
import { useHostDetail } from "./machine-detail";
import { Badge, Card, CardHead, KV, Loading, sevColor } from "./ui";

/**
 * One file on one machine, and why it was flagged.
 *
 * What the console can show is the evidence the agent sent — the offending
 * lines with their invisible characters intact — not the file itself. The
 * agent deliberately never uploads file contents, so this screen says which
 * lines were reported and stops there rather than implying it holds a copy.
 */

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type ArtifactGroup = {
  name: string;
  tool: string;
  kind: string;
  variants: { contentHash: string; machineCount: number; paths: string[] }[];
  machineCount: number;
};

export function FileInspectScreen({ hostId }: { hostId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const path = params.get("path");
  const { data: detail, isLoading } = useHostDetail(hostId);
  const { data: artifactData } = useSWR<{ artifacts: ArtifactGroup[] }>(
    `${base}/api/fleet/artifacts`,
    fetcher
  );

  if (isLoading || !detail) {
    return <Loading label="Loading the evidence…" />;
  }

  const flagged = [...detail.findings]
    .filter((f) => f.filePath)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  const selectedPath = path ?? flagged[0]?.filePath ?? null;
  const onThisFile = flagged.filter((f) => f.filePath === selectedPath);
  const finding = onThisFile[0];
  const item = detail.items.find((i) => i.path === selectedPath);

  const flaggedPaths = new Set(flagged.map((f) => f.filePath));
  const cleanCount = detail.items.length - flaggedPaths.size;

  // Which other machines carry this exact file — content hash, not path.
  const hash = item?.contentHash ?? finding?.contentHash ?? null;
  const elsewhere = hash
    ? (artifactData?.artifacts ?? [])
        .flatMap((group) => group.variants)
        .find((variant) => variant.contentHash === hash)
    : undefined;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "262px minmax(0,1fr) 330px",
        gap: "16px",
        flex: 1,
        minHeight: 0,
      }}
    >
      <Card grow style={{ overflow: "hidden" }}>
        <div
          className="card-h"
          style={{
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "3px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
            }}
          >
            <h3>Flagged on this machine</h3>
            {flagged.length > 0 && (
              <span className="badge b-crit" style={{ marginLeft: "auto" }}>
                {flagged.length}
              </span>
            )}
          </div>
          <span style={{ fontSize: "11.5px", color: "var(--fg3)" }}>
            {detail.host.hostname} · {detail.host.owner ?? "Unassigned"}
          </span>
        </div>

        <div style={{ overflow: "auto", minHeight: 0 }}>
          {flagged.length === 0 && (
            <p
              style={{
                padding: "16px",
                fontSize: "12.5px",
                color: "var(--fg3)",
              }}
            >
              Nothing on this machine is flagged.
            </p>
          )}
          {flagged.map((f) => {
            const on = f.filePath === selectedPath;
            return (
              <button
                className="rowbtn"
                key={f.fingerprint}
                onClick={() =>
                  router.replace(
                    `/fleet/machines/${hostId}/file?path=${encodeURIComponent(f.filePath ?? "")}`
                  )
                }
                style={{
                  display: "flex",
                  gap: "10px",
                  padding: "11px 13px",
                  borderBottom:
                    "1px solid color-mix(in oklch, var(--border) 55%, transparent)",
                  ...(on ? { background: "var(--muted)" } : {}),
                }}
                type="button"
              >
                <span
                  className="dot"
                  style={{ background: sevColor(f.severity), marginTop: "6px" }}
                />
                <span
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <span
                    className="mono trunc"
                    style={{
                      fontSize: "12px",
                      ...(on
                        ? { color: "var(--fg)", fontWeight: 500 }
                        : { color: "var(--fg2)" }),
                    }}
                  >
                    {displayPath(f.filePath ?? "", {
                      username: detail.host.username,
                    })}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span className="badge b-out" style={{ fontSize: "11px" }}>
                      {detail.items.find((i) => i.path === f.filePath)?.tool ??
                        "unknown"}
                    </span>
                    <span
                      style={{ fontSize: "11px", color: sevColor(f.severity) }}
                    >
                      {f.ruleId}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: "auto",
            padding: "11px 13px",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "11.5px", color: "var(--fg3)" }}>
            {cleanCount} more artifact{cleanCount === 1 ? "" : "s"}, no
            findings.
          </span>
        </div>
      </Card>

      <Card grow style={{ overflow: "hidden" }}>
        <div className="card-h" style={{ gap: "8px" }}>
          <span
            className="mono trunc"
            style={{ fontSize: "12.5px", fontWeight: 500 }}
          >
            {selectedPath ?? "No file selected"}
          </span>
          {item && <span className="badge b-sec">{item.scope}</span>}
          <Link
            className="btn xs btn-outline"
            href={`/fleet/machines/${hostId}/report`}
            style={{ marginLeft: "auto" }}
          >
            All findings
          </Link>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            padding: "9px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--muted)",
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          <span
            className="mono trunc"
            style={{ fontSize: "11.5px", color: "var(--fg3)" }}
          >
            {hash ? `File hash ${shortHash(hash)}` : "No content hash reported"}
          </span>
          {detail.lastCollectedAt && (
            <span style={{ fontSize: "11.5px", color: "var(--fg3)" }}>
              Seen in the report of{" "}
              {new Date(detail.lastCollectedAt).toLocaleString(undefined, {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        <div style={{ overflow: "auto", minHeight: 0, padding: "14px 16px" }}>
          {onThisFile.length === 0 && (
            <p style={{ fontSize: "13px", color: "var(--fg3)" }}>
              This file carries no findings.
            </p>
          )}

          {onThisFile.map((f) => (
            <div
              key={f.fingerprint}
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <EvidenceView
                column={f.column}
                contentHash={null}
                evidence={f.evidence}
                filePath={null}
                line={f.line}
              />

              <div
                style={{
                  border:
                    "1px solid color-mix(in oklch, var(--crit) 35%, transparent)",
                  background: "var(--crit-bg)",
                  borderRadius: "9px",
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "9px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <span
                    className="dot"
                    style={{ background: sevColor(f.severity) }}
                  />
                  <span
                    className="mono"
                    style={{
                      fontSize: "11.5px",
                      color: sevColor(f.severity),
                      fontWeight: 500,
                    }}
                  >
                    {f.ruleId}
                  </span>
                  <span className="badge b-crit" style={{ marginLeft: "auto" }}>
                    {f.severity.charAt(0) + f.severity.slice(1).toLowerCase()}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "12.5px",
                    color: "var(--fg2)",
                    lineHeight: 1.55,
                  }}
                >
                  {f.description}
                </p>
                {f.line !== null && (
                  <span
                    className="mono"
                    style={{
                      fontSize: "11px",
                      color: "var(--fg3)",
                      marginLeft: "auto",
                    }}
                  >
                    line {f.line}
                    {f.column === null ? "" : `, col ${f.column}`}
                  </span>
                )}
              </div>
            </div>
          ))}

          <p
            style={{
              marginTop: "16px",
              fontSize: "11.5px",
              color: "var(--fg3)",
              lineHeight: 1.55,
            }}
          >
            The agent sends the lines that caused a finding, never the file. To
            read the whole file, open it on {detail.host.hostname}.
          </p>
        </div>
      </Card>

      <Card grow style={{ overflow: "auto" }}>
        <CardHead title="Finding" />
        {finding ? (
          <div
            style={{
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <KV k="Rule" mono v={finding.ruleId} />
              <KV
                k="Finding fingerprint"
                mono
                v={
                  <span className="trunc">
                    {shortHash(finding.fingerprint)}
                  </span>
                }
              />
              <KV k="Severity" v={finding.severity} />
              {hash && <KV k="Content hash" mono v={shortHash(hash)} />}
            </div>

            <div style={{ height: "1px", background: "var(--border)" }} />

            <div
              style={{ display: "flex", flexDirection: "column", gap: "9px" }}
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
                Elsewhere in the fleet
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  fontSize: "13px",
                }}
              >
                <Ic name="server" size={15} />
                <span className="trunc">{detail.host.hostname}</span>
                <Badge tone="crit">this file</Badge>
              </div>
              <span style={{ fontSize: "12px", color: "var(--fg3)" }}>
                {elsewhere && elsewhere.machineCount > 1
                  ? `${elsewhere.machineCount - 1} other machine${elsewhere.machineCount === 2 ? "" : "s"} carry this exact file.`
                  : "No other machine carries this exact file."}
              </span>
            </div>

            <div style={{ height: "1px", background: "var(--border)" }} />

            <div
              style={{ display: "flex", flexDirection: "column", gap: "9px" }}
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
                What closes it
              </span>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--fg2)",
                  lineHeight: 1.55,
                }}
              >
                Fix it on {detail.host.hostname}. This finding closes on its own
                when a later report from that machine no longer contains it —
                nothing here reaches the machine.
              </p>
              <span
                className="mono"
                style={{ fontSize: "11.5px", color: "var(--fg3)" }}
              >
                Last report{" "}
                {formatRelativeTime(new Date(detail.host.lastSeenAt))}
              </span>
            </div>
          </div>
        ) : (
          <p style={{ padding: "16px", fontSize: "13px", color: "var(--fg3)" }}>
            Select a flagged file to see why it was reported.
          </p>
        )}
      </Card>
    </div>
  );
}
