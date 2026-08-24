"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import useSWR from "swr";
import { API_BASE } from "@/lib/security/fleet-api";
import { fetcher } from "@/lib/utils";
import { Ic } from "./icons";
import { OperatorBadge } from "./operator-badge";

/**
 * The Guardian application shell: a 240px rail, a brand block that lines up
 * with the top bar beside it, and a breadcrumb that says where you are.
 *
 * Counts in the rail are what the fleet actually reported. A nav that claims
 * 482 machines on an empty install is the first thing that makes a console
 * feel untrue, so a count that is zero is not rendered at all.
 */

type CountKey = "machines" | "artifacts" | "findings" | "policies";

const NAV: {
  href: string;
  label: string;
  icon: string;
  countKey?: CountKey;
  critical?: boolean;
}[] = [
  { href: "/fleet", label: "Overview", icon: "overview" },
  {
    href: "/fleet/machines",
    label: "Machines",
    icon: "machines",
    countKey: "machines",
  },
  {
    href: "/fleet/inventory",
    label: "Inventory",
    icon: "inventory",
    countKey: "artifacts",
  },
  {
    href: "/fleet/findings",
    label: "Findings",
    icon: "findings",
    countKey: "findings",
    critical: true,
  },
  {
    href: "/fleet/policies",
    label: "Policies",
    icon: "policies",
    countKey: "policies",
  },
  { href: "/fleet/activity", label: "Activity", icon: "activity" },
  { href: "/fleet/access", label: "API & access", icon: "api" },
];

type Counts = Record<CountKey, number>;

export function useFleetCounts(): Counts {
  const { data: hosts } = useSWR<{ hosts: unknown[] }>(`${API_BASE}`, fetcher);
  const { data: findings } = useSWR<{ findings: { status: string }[] }>(
    `${API_BASE}/findings`,
    fetcher
  );
  const { data: artifacts } = useSWR<{ artifacts: unknown[] }>(
    `${API_BASE}/artifacts`,
    fetcher
  );
  const { data: policies } = useSWR<{ policies: unknown[] }>(
    `${API_BASE}/policies`,
    fetcher
  );

  return {
    machines: hosts?.hosts.length ?? 0,
    artifacts: artifacts?.artifacts.length ?? 0,
    findings: (findings?.findings ?? []).filter((f) => f.status !== "resolved")
      .length,
    policies: policies?.policies.length ?? 0,
  };
}

/** 3100 in a 240px rail is noise; 3.1k is the number. */
export function formatCount(value: number): string {
  if (value < 1000) {
    return String(value);
  }
  const thousands = value / 1000;
  return `${thousands < 10 ? thousands.toFixed(1).replace(/\.0$/, "") : Math.round(thousands)}k`;
}

export type Crumb = { label: string; href?: string };

export function FleetShell({
  title,
  crumbs = [],
  actions,
  banner,
  children,
}: {
  title: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const counts = useFleetCounts();

  return (
    <div className="gd">
      <aside className="side">
        <div className="brand">
          <div className="brand-mark">
            <Ic name="policies" size={14} sw={2} />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              lineHeight: 1.15,
            }}
          >
            <span style={{ fontSize: "13.5px", fontWeight: 600 }}>
              Guardian
            </span>
            <span style={{ fontSize: "11px", color: "var(--fg3)" }}>
              Fleet reporting
            </span>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-h" style={{ paddingTop: "4px" }}>
            Fleet
          </div>
          {NAV.map((item) => {
            const active =
              item.href === "/fleet"
                ? pathname === "/fleet"
                : pathname.startsWith(item.href);
            const count = item.countKey ? counts[item.countKey] : 0;

            return (
              <Link
                className={`nav-i${active ? " on" : ""}`}
                href={item.href}
                key={item.href}
              >
                <Ic name={item.icon} />
                <span>{item.label}</span>
                {count > 0 && (
                  <span className={`ct${item.critical ? " crit" : ""}`}>
                    {formatCount(count)}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <OperatorBadge />
      </aside>

      <div className="main">
        <header className="top">
          <h1
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              minWidth: 0,
            }}
          >
            {crumbs.map((crumb) => (
              <span
                key={crumb.label}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {crumb.href ? (
                  <Link className="crumb" href={crumb.href}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="crumb">{crumb.label}</span>
                )}
                <span style={{ color: "var(--fg3)", fontWeight: 400 }}>/</span>
              </span>
            ))}
            <span className="trunc">{title}</span>
          </h1>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {actions}
          </div>
        </header>
        {banner}
        <div className="body">{children}</div>
      </div>
    </div>
  );
}
