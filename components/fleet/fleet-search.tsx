"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { hashSlug, shortHash } from "@/lib/security/artifact-presentation";
import { API_BASE } from "@/lib/security/fleet-api";
import { displayPath } from "@/lib/security/fleet-presentation";
import { fetcher } from "@/lib/utils";
import { Ic } from "./icons";
import { sevColor } from "./ui";

/**
 * Fleet search.
 *
 * Searches what an operator actually has in mind when they reach for it: a
 * machine, the person who uses it, a rule that fired, or a file by name. A
 * query that matches nothing says so — silence here is indistinguishable
 * from a broken box, which is exactly how it read before.
 */

type Host = {
  host: {
    id: string;
    hostname: string;
    owner: string | null;
    team: string | null;
  };
};

type Finding = {
  fingerprint: string;
  ruleId: string;
  severity: string;
  description: string;
  machineCount: number;
};

type Artifact = {
  name: string;
  tool: string;
  variants: { contentHash: string; machineCount: number; paths: string[] }[];
};

type Result = {
  key: string;
  href: string;
  group: string;
  title: string;
  detail: string;
  dot?: string;
};

/** Results shown per group. Enough to recognise, few enough to scan. */
const PER_GROUP = 4;

function matches(needle: string, ...fields: (string | null | undefined)[]) {
  return fields.some((f) => f?.toLowerCase().includes(needle));
}

export function FleetSearch() {
  const router = useRouter();
  const box = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const { data: hostData } = useSWR<{ hosts: Host[] }>(API_BASE, fetcher);
  const { data: findingData } = useSWR<{ findings: Finding[] }>(
    `${API_BASE}/findings`,
    fetcher
  );
  const { data: artifactData } = useSWR<{ artifacts: Artifact[] }>(
    `${API_BASE}/artifacts`,
    fetcher
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        box.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const needle = query.trim().toLowerCase();

  const results = useMemo<Result[]>(() => {
    if (!needle) {
      return [];
    }

    const machines = (hostData?.hosts ?? [])
      .filter((entry) =>
        matches(needle, entry.host.hostname, entry.host.owner, entry.host.team)
      )
      .slice(0, PER_GROUP)
      .map((entry) => ({
        key: `machine-${entry.host.id}`,
        href: `/fleet/machines/${entry.host.id}`,
        group: "Machines",
        title: entry.host.hostname,
        detail: [entry.host.owner ?? "Unassigned", entry.host.team]
          .filter(Boolean)
          .join(" · "),
      }));

    const findings = (findingData?.findings ?? [])
      .filter((f) => matches(needle, f.ruleId, f.description))
      .slice(0, PER_GROUP)
      .map((f) => ({
        key: `finding-${f.fingerprint}`,
        href: "/fleet/findings",
        group: "Findings",
        title: f.description,
        detail: `${f.ruleId} · ${f.machineCount} machine${f.machineCount === 1 ? "" : "s"}`,
        dot: sevColor(f.severity),
      }));

    const artifacts = (artifactData?.artifacts ?? [])
      .filter(
        (a) =>
          matches(needle, a.name, a.tool) ||
          a.variants.some((v) => v.paths.some((path) => matches(needle, path)))
      )
      .slice(0, PER_GROUP)
      .flatMap((a) => {
        const variant = a.variants[0];
        return variant
          ? [
              {
                key: `artifact-${variant.contentHash}`,
                href: `/fleet/inventory/${hashSlug(variant.contentHash)}`,
                group: "Inventory",
                title: a.name,
                detail: `${a.tool} · ${shortHash(variant.contentHash)} · ${displayPath(variant.paths[0] ?? "")}`,
              },
            ]
          : [];
      });

    return [...machines, ...findings, ...artifacts];
  }, [needle, hostData, findingData, artifactData]);

  function open(result: Result) {
    setQuery("");
    setActive(0);
    box.current?.blur();
    router.push(result.href);
  }

  // Groups are rendered in order; the flat list is what the keyboard walks.
  const groups = results.reduce<Record<string, Result[]>>((acc, result) => {
    acc[result.group] = [...(acc[result.group] ?? []), result];
    return acc;
  }, {});

  return (
    <div style={{ position: "relative" }}>
      <label className="input" style={{ width: "220px" }}>
        <Ic name="search" size={14} />
        <input
          aria-label="Search fleet"
          id="fleet-search"
          name="q"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            }
            if (event.key === "Enter" && results[active]) {
              open(results[active]);
            }
            if (event.key === "Escape") {
              setQuery("");
              box.current?.blur();
            }
          }}
          placeholder="Search fleet"
          ref={box}
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
        {query ? (
          <button
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              box.current?.focus();
            }}
            style={{ display: "flex", color: "var(--fg3)" }}
            type="button"
          >
            <Ic name="x" size={13} />
          </button>
        ) : (
          <span
            className="mono"
            style={{ fontSize: "11px", color: "var(--fg3)" }}
          >
            ⌘K
          </span>
        )}
      </label>

      {needle && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "38px",
            right: 0,
            width: "360px",
            zIndex: 40,
            padding: "4px",
            gap: "1px",
            maxHeight: "420px",
            overflow: "auto",
          }}
        >
          {results.length === 0 ? (
            <p
              style={{
                padding: "12px 10px",
                fontSize: "12.5px",
                color: "var(--fg3)",
                lineHeight: 1.5,
              }}
            >
              Nothing matches “{query.trim()}”. Search finds machines by name or
              owner, findings by rule, and artifacts by filename.
            </p>
          ) : (
            Object.entries(groups).map(([group, rows]) => (
              <div key={group}>
                <div
                  className="nav-h"
                  style={{ padding: "8px 9px 4px", letterSpacing: ".05em" }}
                >
                  {group}
                </div>
                {rows.map((result) => (
                  <Link
                    className="rowbtn"
                    href={result.href}
                    key={result.key}
                    onClick={() => {
                      setQuery("");
                      setActive(0);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      borderRadius: "8px",
                      padding: "7px 9px",
                      ...(results[active]?.key === result.key
                        ? { background: "var(--muted)" }
                        : {}),
                    }}
                  >
                    {result.dot && (
                      <span
                        className="dot"
                        style={{ background: result.dot }}
                      />
                    )}
                    <span style={{ minWidth: 0 }}>
                      <span
                        className="trunc"
                        style={{
                          display: "block",
                          fontSize: "13px",
                          fontWeight: 500,
                        }}
                      >
                        {result.title}
                      </span>
                      <span
                        className="trunc"
                        style={{
                          display: "block",
                          fontSize: "11.5px",
                          color: "var(--fg3)",
                        }}
                      >
                        {result.detail}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
