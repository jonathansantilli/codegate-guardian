"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/utils";
import { Ic } from "./icons";

/**
 * Fleet search.
 *
 * Searches what an operator actually has in mind when they reach for it: a
 * machine, or the person who uses it. Matches jump straight to that machine.
 */

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Host = {
  host: {
    id: string;
    hostname: string;
    owner: string | null;
    team: string | null;
  };
};

export function FleetSearch() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const { data } = useSWR<{ hosts: Host[] }>(`${base}/api/fleet`, fetcher);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? (data?.hosts ?? []).filter((entry) =>
        `${entry.host.hostname} ${entry.host.owner ?? ""} ${entry.host.team ?? ""}`
          .toLowerCase()
          .includes(needle)
      )
    : [];

  return (
    <div style={{ position: "relative" }}>
      <label className="input" style={{ width: "220px" }}>
        <Ic name="search" size={14} />
        <input
          className="input"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && matches[0]) {
              setQuery("");
              router.push(`/fleet/machines/${matches[0].host.id}`);
            }
            if (event.key === "Escape") {
              setQuery("");
            }
          }}
          placeholder="Search fleet"
          ref={input}
          style={{ border: 0, height: "auto", padding: 0, background: "none" }}
          value={query}
        />
        {!query && (
          <span
            className="mono"
            style={{
              marginLeft: "auto",
              fontSize: "11px",
              color: "var(--fg3)",
            }}
          >
            ⌘K
          </span>
        )}
      </label>

      {matches.length > 0 && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "38px",
            right: 0,
            width: "300px",
            zIndex: 20,
            padding: "4px",
            gap: "1px",
          }}
        >
          {matches.slice(0, 6).map((entry) => (
            <button
              className="rowbtn"
              key={entry.host.id}
              onClick={() => {
                setQuery("");
                router.push(`/fleet/machines/${entry.host.id}`);
              }}
              style={{ borderRadius: "8px", padding: "7px 9px" }}
              type="button"
            >
              <div style={{ fontSize: "13px", fontWeight: 500 }}>
                {entry.host.hostname}
              </div>
              <div style={{ fontSize: "11.5px", color: "var(--fg3)" }}>
                {entry.host.owner ?? "Unassigned"}
                {entry.host.team ? ` · ${entry.host.team}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
