"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { hashSlug, shortHash } from "@/lib/security/artifact-presentation";
import { severityRank } from "@/lib/security/finding-presentation";
import { API_BASE } from "@/lib/security/fleet-api";
import {
  displayPath,
  formatRelativeTime,
} from "@/lib/security/fleet-presentation";
import { fetcher } from "@/lib/utils";
import { Ic } from "./icons";
import { SuppressDialog, type SuppressTarget } from "./suppress-dialog";
import { Avatar, Badge, Card, CardHead, KV, Loading, Sev } from "./ui";

/**
 * One artifact variant: this exact file, and everyone who has it.
 *
 * The server holds hashes, not contents, so this screen compares what it can
 * actually compare — identity, spread, age and verdict — and says so, rather
 * than showing a line-by-line diff it has no bytes to produce.
 */

type Variant = {
  contentHash: string;
  name: string;
  tool: string;
  kind: string;
  firstSeenAt: string;
  machines: {
    hostId: string;
    hostname: string;
    owner: string | null;
    team: string | null;
    paths: string[];
    lastSeenAt: string;
  }[];
  siblings: {
    contentHash: string;
    machineCount: number;
    firstSeenAt: string;
    paths: string[];
  }[];
};

type Finding = {
  contentHash: string | null;
  severity: string;
  ruleId: string;
  description: string;
};

export function ArtifactDetailScreen({ contentHash }: { contentHash: string }) {
  const { data, isLoading, error } = useSWR<Variant>(
    `${API_BASE}/artifact?contentHash=${encodeURIComponent(contentHash)}`,
    fetcher
  );
  const { data: findingData } = useSWR<{ findings: Finding[] }>(
    `${API_BASE}/findings`,
    fetcher
  );
  const [suppressing, setSuppressing] = useState<SuppressTarget | null>(null);

  if (isLoading) {
    return <Loading label="Loading the artifact…" />;
  }
  if (error || !data) {
    return (
      <Loading label="No machine's latest report carries this file any more." />
    );
  }

  const byHash = new Map<string, Finding>();
  for (const finding of findingData?.findings ?? []) {
    if (!finding.contentHash) {
      continue;
    }
    const current = byHash.get(finding.contentHash);
    if (
      !current ||
      severityRank(finding.severity) < severityRank(current.severity)
    ) {
      byHash.set(finding.contentHash, finding);
    }
  }

  const verdict = byHash.get(data.contentHash);
  const all = [
    {
      contentHash: data.contentHash,
      machineCount: data.machines.length,
      firstSeenAt: data.firstSeenAt,
      paths: [...new Set(data.machines.flatMap((m) => m.paths))],
      here: true,
    },
    ...data.siblings.map((s) => ({ ...s, here: false })),
  ];

  return (
    <>
      <Card style={{ padding: "16px 18px", gap: "14px" }}>
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
            <Ic name="inventory" size={19} />
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
              <h2 style={{ fontSize: "19px" }}>{data.name}</h2>
              <span className="badge b-out">{data.tool}</span>
              <span className="badge b-sec">{data.kind}</span>
              {verdict ? (
                <Badge tone="crit">{verdict.ruleId}</Badge>
              ) : (
                <Badge tone="ok">No finding on this variant</Badge>
              )}
              {verdict && (
                <button
                  className="btn xs btn-outline"
                  onClick={() =>
                    setSuppressing({
                      ruleId: verdict.ruleId,
                      label: `${verdict.ruleId} on ${data.name}`,
                      blastRadius: data.machines.length,
                    })
                  }
                  type="button"
                >
                  Suppress this variant fleet-wide
                </button>
              )}
            </div>
            <span
              className="mono trunc"
              style={{ fontSize: "12px", color: "var(--fg3)" }}
            >
              {data.contentHash}
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
          <KV k="Machines carrying it" v={data.machines.length} />
          <KV k="Other variants of this name" v={data.siblings.length} />
          <KV
            k="First reported"
            v={formatRelativeTime(new Date(data.firstSeenAt))}
          />
          <KV
            k="Verdict"
            v={
              verdict ? (
                <Sev label={verdict.description} severity={verdict.severity} />
              ) : (
                "Clean"
              )
            }
          />
        </div>
      </Card>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          flex: 1,
          minHeight: 0,
        }}
      >
        <Card grow style={{ overflow: "hidden" }}>
          <CardHead note="Same name, different bytes" title="Variants" />
          <div
            style={{
              overflow: "auto",
              minHeight: 0,
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {all.map((variant) => {
              const risk = byHash.get(variant.contentHash);
              return (
                <div
                  key={variant.contentHash}
                  style={{
                    border: variant.here
                      ? "1px solid var(--fg)"
                      : "1px solid var(--border)",
                    borderRadius: "10px",
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    background: variant.here ? "var(--muted)" : "var(--card)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span
                      className="mono trunc"
                      style={{ fontSize: "12px", fontWeight: 500 }}
                    >
                      {shortHash(variant.contentHash)}
                    </span>
                    {variant.here && <Badge tone="sec">this one</Badge>}
                    <span
                      className="num"
                      style={{
                        marginLeft: "auto",
                        fontSize: "12.5px",
                        color: "var(--fg3)",
                      }}
                    >
                      {variant.machineCount} machine
                      {variant.machineCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    {risk ? (
                      <Sev label={risk.description} severity={risk.severity} />
                    ) : (
                      <span style={{ fontSize: "12.5px", color: "var(--fg3)" }}>
                        No finding reported on this file
                      </span>
                    )}
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: "11.5px",
                        color: "var(--fg3)",
                      }}
                    >
                      first seen{" "}
                      {formatRelativeTime(new Date(variant.firstSeenAt))}
                    </span>
                  </div>
                  {!variant.here && (
                    <Link
                      className="btn xs btn-outline"
                      href={`/fleet/inventory/${hashSlug(variant.contentHash)}`}
                      style={{ width: "fit-content" }}
                    >
                      Open this variant
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card grow style={{ overflow: "hidden" }}>
          <CardHead
            note="Every machine whose latest report carries this exact file"
            title="Who has it"
          />
          <div style={{ overflow: "auto", minHeight: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Machine &amp; owner</th>
                  <th>Path</th>
                  <th className="r">Last report</th>
                </tr>
              </thead>
              <tbody>
                {data.machines.map((machine) => (
                  <tr key={machine.hostId}>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <Avatar
                          name={machine.owner ?? machine.hostname}
                          size={28}
                        />
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            minWidth: 0,
                          }}
                        >
                          <Link
                            href={`/fleet/machines/${machine.hostId}`}
                            style={{ fontWeight: 500 }}
                          >
                            {machine.hostname}
                          </Link>
                          <span
                            className="trunc"
                            style={{ fontSize: "11.5px", color: "var(--fg3)" }}
                          >
                            {machine.owner ?? "Unassigned"}
                            {machine.team ? ` · ${machine.team}` : ""}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td
                      className="mono trunc"
                      style={{
                        fontSize: "12px",
                        color: "var(--fg2)",
                        maxWidth: "240px",
                      }}
                      title={machine.paths.join("\n")}
                    >
                      {displayPath(machine.paths[0] ?? "")}
                      {machine.paths.length > 1 && (
                        <span style={{ color: "var(--fg3)" }}>
                          {" "}
                          +{machine.paths.length - 1} more
                        </span>
                      )}
                    </td>
                    <td
                      className="r mono"
                      style={{ fontSize: "12px", color: "var(--fg3)" }}
                    >
                      {formatRelativeTime(new Date(machine.lastSeenAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            style={{
              marginTop: "auto",
              padding: "11px 14px",
              borderTop: "1px solid var(--border)",
              fontSize: "11.5px",
              color: "var(--fg3)",
              lineHeight: 1.5,
            }}
          >
            Machines are compared by content hash, not by file contents — the
            agent reports the hash and never uploads the file, so two variants
            are known to differ without either being stored here.
          </div>
        </Card>
      </div>

      {suppressing && (
        <SuppressDialog
          onClose={() => setSuppressing(null)}
          target={suppressing}
        />
      )}
    </>
  );
}
