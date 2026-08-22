"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import useSWR from "swr";
import {
  fleetShare,
  hashSlug,
  hasMultipleVariants,
  orderVariants,
  shortHash,
} from "@/lib/security/artifact-presentation";
import { severityRank } from "@/lib/security/finding-presentation";
import { API_BASE } from "@/lib/security/fleet-api";
import {
  displayPath,
  formatRelativeTime,
} from "@/lib/security/fleet-presentation";
import { fetcher } from "@/lib/utils";
import { Ic } from "./icons";
import { Badge, Card, CardHead, Empty, Loading, Sev } from "./ui";

/**
 * The fleet's artifacts, keyed by content hash.
 *
 * Grouping by name would merge a malicious skill with the clean one it
 * impersonates. Grouping by hash keeps them apart and makes the split
 * visible: one name, several distinct files, each with its own machines.
 */

type Variant = {
  contentHash: string;
  machineCount: number;
  firstSeenAt: string;
  paths: string[];
};

type ArtifactGroup = {
  name: string;
  tool: string;
  kind: string;
  variants: Variant[];
  machineCount: number;
};

type Finding = {
  contentHash: string | null;
  severity: string;
  description: string;
};

type KindFilter = "all" | "skill" | "config";

const KIND_FILTERS: { key: KindFilter; label: string }[] = [
  { key: "all", label: "All kinds" },
  { key: "skill", label: "Skills" },
  { key: "config", label: "Configs" },
];

export function InventoryScreen() {
  const { data, isLoading } = useSWR<{ artifacts: ArtifactGroup[] }>(
    `${API_BASE}/artifacts`,
    fetcher,
    { refreshInterval: 60_000 }
  );
  const { data: findingData } = useSWR<{ findings: Finding[] }>(
    `${API_BASE}/findings`,
    fetcher
  );
  const { data: hostData } = useSWR<{ hosts: unknown[] }>(
    `${API_BASE}`,
    fetcher
  );

  const [expanded, setExpanded] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");

  if (isLoading) {
    return <Loading label="Loading the inventory…" />;
  }

  const artifacts = data?.artifacts ?? [];

  if (artifacts.length === 0) {
    return (
      <Empty
        actions={
          <Link className="btn btn-primary" href="/fleet/access">
            Enrol a machine
          </Link>
        }
        blurb="Once a machine checks in, every AI tool, skill, MCP server and rules file it carries is listed here — grouped by content hash, so two files that share a name stay separate."
        icon="inventory"
        title="Nothing to inventory yet"
      />
    );
  }

  const fleetSize = hostData?.hosts.length ?? 0;

  // A hash that any machine reported a finding on is a hash to flag, wherever
  // else in the fleet it turns up.
  const riskByHash = new Map<string, Finding>();
  for (const finding of findingData?.findings ?? []) {
    if (!finding.contentHash) {
      continue;
    }
    const current = riskByHash.get(finding.contentHash);
    if (
      !current ||
      severityRank(finding.severity) < severityRank(current.severity)
    ) {
      riskByHash.set(finding.contentHash, finding);
    }
  }

  const worstOf = (group: ArtifactGroup) =>
    group.variants
      .map((v) => riskByHash.get(v.contentHash))
      .filter((f): f is Finding => Boolean(f))
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))[0];

  const counts = KIND_FILTERS.map((f) => ({
    ...f,
    count:
      f.key === "all"
        ? artifacts.length
        : artifacts.filter((a) => a.kind === f.key).length,
  }));

  const needle = query.trim().toLowerCase();
  const visible = artifacts
    .filter((a) => kind === "all" || a.kind === kind)
    .filter(
      (a) =>
        !needle ||
        a.name.toLowerCase().includes(needle) ||
        a.variants.some((v) =>
          v.paths.some((p) => p.toLowerCase().includes(needle))
        )
    )
    .sort((a, b) => {
      const ra = worstOf(a);
      const rb = worstOf(b);
      const rank =
        (ra ? severityRank(ra.severity) : Number.MAX_SAFE_INTEGER) -
        (rb ? severityRank(rb.severity) : Number.MAX_SAFE_INTEGER);
      return rank || b.machineCount - a.machineCount;
    });

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "11px 15px",
          borderRadius: "10px",
          border: "1px solid var(--border)",
          background: "var(--card)",
        }}
      >
        <Ic name="inventory" size={15} />
        <span style={{ fontSize: "13px", color: "var(--fg2)" }}>
          <b style={{ color: "var(--fg)", fontWeight: 600 }}>
            Grouped by content hash, not by name.
          </b>{" "}
          Two files that share a name but differ by a single byte are two
          artifacts here — expand a row to see each variant and which machines
          carry it.
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <label className="input" style={{ width: "250px" }}>
          <Ic name="search" size={14} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name or path"
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
            className={`chip${kind === f.key ? " on" : ""}`}
            key={f.key}
            onClick={() => setKind(f.key)}
            type="button"
          >
            {f.label}{" "}
            <span
              className="num"
              style={{ opacity: kind === f.key ? 0.65 : 1 }}
            >
              {f.count}
            </span>
          </button>
        ))}
      </div>

      <Card grow style={{ overflow: "hidden" }}>
        <CardHead
          action={<Badge tone="sec">{artifacts.length} total</Badge>}
          note="Sorted by risk, then by how many machines carry it"
          title="Artifacts"
        />
        <div style={{ overflow: "auto", minHeight: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Artifact</th>
                <th>Tool</th>
                <th style={{ width: "180px" }}>Machines · % of fleet</th>
                <th>Risk</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              {visible.map((group) => {
                const key = `${group.tool}-${group.kind}-${group.name}`;
                const risk = worstOf(group);
                const open = expanded === key;
                const pct = fleetShare(group.machineCount, fleetSize);

                return (
                  <Fragment key={key}>
                    <tr>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          {hasMultipleVariants(group) && (
                            <button
                              aria-label={
                                open ? "Collapse variants" : "Expand variants"
                              }
                              onClick={() => setExpanded(open ? null : key)}
                              style={{
                                display: "flex",
                                color: "var(--fg3)",
                                transform: open ? "rotate(90deg)" : "none",
                              }}
                              type="button"
                            >
                              <Ic name="chevron" size={13} />
                            </button>
                          )}
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "1px",
                              minWidth: 0,
                            }}
                          >
                            <span style={{ fontWeight: 500 }}>
                              {group.name}
                            </span>
                            <span
                              className="mono trunc"
                              style={{
                                fontSize: "11.5px",
                                color: "var(--fg3)",
                                maxWidth: "320px",
                              }}
                            >
                              {displayPath(group.variants[0]?.paths[0] ?? "")}
                            </span>
                          </div>
                          {hasMultipleVariants(group) && (
                            <Badge tone="sec">
                              {group.variants.length} variants
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="badge b-out">{group.tool}</span>
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "9px",
                          }}
                        >
                          <div
                            style={{
                              width: "78px",
                              height: "5px",
                              borderRadius: "999px",
                              background: "var(--muted)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: "100%",
                                background: risk ? "var(--crit)" : "var(--fg3)",
                                borderRadius: "999px",
                              }}
                            />
                          </div>
                          <span
                            className="num"
                            style={{ fontSize: "12.5px", color: "var(--fg2)" }}
                          >
                            {group.machineCount}
                          </span>
                          <span
                            style={{ fontSize: "11.5px", color: "var(--fg3)" }}
                          >
                            {pct}%
                          </span>
                        </div>
                      </td>
                      <td>
                        {risk ? (
                          <Sev
                            label={risk.description}
                            severity={risk.severity}
                          />
                        ) : (
                          <span
                            style={{ color: "var(--fg3)", fontSize: "12.5px" }}
                          >
                            Clean
                          </span>
                        )}
                      </td>
                      <td className="r">
                        {hasMultipleVariants(group) ? (
                          <button
                            className="btn xs btn-outline"
                            onClick={() => setExpanded(open ? null : key)}
                            type="button"
                          >
                            {open ? "Hide variants" : "Compare variants"}
                          </button>
                        ) : group.variants[0] ? (
                          <Link
                            className="btn xs btn-outline"
                            href={`/fleet/inventory/${hashSlug(group.variants[0].contentHash)}`}
                          >
                            View the machines
                          </Link>
                        ) : null}
                      </td>
                    </tr>

                    {open &&
                      orderVariants(group.variants).map((variant) => {
                        const variantRisk = riskByHash.get(variant.contentHash);
                        return (
                          <tr key={`${key}-${variant.contentHash}`}>
                            <td
                              className="vrow"
                              colSpan={5}
                              style={{ padding: 0 }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "12px",
                                  padding: "10px 14px 10px 36px",
                                  background: "var(--muted)",
                                }}
                              >
                                <span
                                  className="mono"
                                  style={{
                                    fontSize: "12px",
                                    color: "var(--fg2)",
                                    width: "220px",
                                  }}
                                >
                                  {shortHash(variant.contentHash)}
                                </span>
                                <span
                                  className="num"
                                  style={{
                                    fontSize: "12.5px",
                                    color: "var(--fg2)",
                                    width: "90px",
                                  }}
                                >
                                  {variant.machineCount} machine
                                  {variant.machineCount === 1 ? "" : "s"}
                                </span>
                                <span
                                  style={{
                                    fontSize: "12px",
                                    color: "var(--fg3)",
                                    width: "110px",
                                  }}
                                >
                                  {formatRelativeTime(
                                    new Date(variant.firstSeenAt)
                                  )}
                                </span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                  {variantRisk ? (
                                    <Sev
                                      label={variantRisk.description}
                                      severity={variantRisk.severity}
                                    />
                                  ) : (
                                    <span
                                      style={{
                                        color: "var(--fg3)",
                                        fontSize: "12.5px",
                                      }}
                                    >
                                      Clean
                                    </span>
                                  )}
                                </span>
                                <Link
                                  className="btn xs btn-outline"
                                  href={`/fleet/inventory/${hashSlug(variant.contentHash)}`}
                                >
                                  View the machines
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
