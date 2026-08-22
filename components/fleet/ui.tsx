import Link from "next/link";
import type { ReactNode } from "react";
import type { HostFreshness } from "@/lib/security/fleet-presentation";
import { Ic } from "./icons";

/**
 * The console's shared surfaces, one per element in the design canvas.
 *
 * Everything here renders the design's own class names — the sizes, colours
 * and spacing live in fleet.css, ported from the canvas — so these components
 * carry structure and nothing else.
 */

export const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  HIGH: "var(--high)",
  MEDIUM: "var(--med)",
  LOW: "var(--low)",
  INFO: "var(--info)",
};

/**
 * How a machine's reporting state reads. Kept beside `sevColor` because the
 * machines list and the machine's own page must agree — a laptop that is
 * "stale" in one place and "offline" in the other is a bug an operator sees
 * before we do.
 */
export const FRESHNESS_LABEL: Record<HostFreshness, string> = {
  online: "Reporting",
  stale: "Stale",
  offline: "No recent reports",
};

export const FRESHNESS_TONE: Record<HostFreshness, "ok" | "warn" | "sec"> = {
  online: "ok",
  stale: "warn",
  offline: "sec",
};

export const FRESHNESS_COLOR: Record<HostFreshness, string> = {
  online: "var(--ok)",
  stale: "var(--warn)",
  offline: "var(--fg3)",
};

export function sevColor(severity: string): string {
  return SEV_COLOR[severity.toUpperCase()] ?? "var(--info)";
}

/** "Jonathan Santilli" → JS; "ci-runner-07" → CI. Never more than two. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function Card({
  children,
  grow,
  style,
}: {
  children: ReactNode;
  grow?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="card"
      style={
        grow ? { flex: 1, minHeight: 0, ...style } : { flexShrink: 0, ...style }
      }
    >
      {children}
    </div>
  );
}

export function CardHead({
  title,
  badge,
  note,
  action,
}: {
  title: string;
  badge?: ReactNode;
  note?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card-h">
      <h3>{title}</h3>
      {badge}
      {note && (
        <span style={{ fontSize: "12.5px", color: "var(--fg3)" }}>{note}</span>
      )}
      {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
    </div>
  );
}

export function Badge({
  tone = "sec",
  children,
}: {
  tone?: "sec" | "out" | "ok" | "warn" | "crit";
  children: ReactNode;
}) {
  return <span className={`badge b-${tone}`}>{children}</span>;
}

export function Dot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} />;
}

export function Sev({ severity, label }: { severity: string; label?: string }) {
  const color = sevColor(severity);
  return (
    <span className="sev" style={{ color }}>
      <Dot color={color} />
      {label ?? severity}
    </span>
  );
}

export function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size <= 26 ? "11px" : "11.5px",
      }}
    >
      {initials(name)}
    </div>
  );
}

export function KV({
  k,
  v,
  mono,
}: {
  k: string;
  v: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className={`v${mono ? " mono" : ""}`}>{v}</span>
    </div>
  );
}

/** The signature element: every surface names the API call behind it. */
export function Api({ method, path }: { method: string; path: string }) {
  return (
    <span className="api">
      <b>{method}</b> {path}
    </span>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <div className="code">{children}</div>;
}

/**
 * `tone` separates "not set up yet" — an invitation to act — from "all
 * clear", which is good news and must not read as a broken page.
 */
export function Empty({
  icon,
  title,
  blurb,
  tone = "setup",
  actions,
  extra,
}: {
  icon: string;
  title: string;
  blurb: string;
  tone?: "setup" | "clear";
  actions?: ReactNode;
  extra?: ReactNode;
}) {
  const ring = tone === "clear" ? "var(--ok)" : "var(--fg3)";
  const bg = tone === "clear" ? "var(--ok-bg)" : "var(--muted)";

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "14px",
          maxWidth: "520px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "14px",
            background: bg,
            color: ring,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ic name={icon} size={22} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <h2 style={{ fontSize: "18px" }}>{title}</h2>
          <p
            style={{ fontSize: "13.5px", color: "var(--fg3)", lineHeight: 1.6 }}
          >
            {blurb}
          </p>
        </div>
        {actions && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "2px",
            }}
          >
            {actions}
          </div>
        )}
        {extra}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub: string;
  tone?: string;
}) {
  return (
    <div className="card" style={{ padding: "14px 16px", gap: "6px" }}>
      <span
        style={{
          fontSize: "11.5px",
          fontWeight: 500,
          letterSpacing: ".05em",
          textTransform: "uppercase",
          color: "var(--fg3)",
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span
          className="num"
          style={{
            fontSize: "28px",
            fontWeight: 600,
            letterSpacing: "-.03em",
            ...(tone ? { color: tone } : {}),
          }}
        >
          {value}
        </span>
        <span style={{ fontSize: "12.5px", color: "var(--fg3)" }}>{sub}</span>
      </div>
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0,1fr))",
        gap: "12px",
      }}
    >
      {children}
    </div>
  );
}

export function Tabs({
  tabs,
}: {
  tabs: { label: string; count?: string | number; href: string; on: boolean }[];
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        flexShrink: 0,
      }}
    >
      {tabs.map((t) => (
        <Link
          href={t.href}
          key={t.label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            height: "34px",
            padding: "0 12px",
            borderRadius: "8px",
            fontSize: "13.5px",
            fontWeight: 500,
            ...(t.on
              ? { background: "var(--muted)", color: "var(--fg)" }
              : { color: "var(--fg3)" }),
          }}
        >
          {t.label}
          {t.count ? (
            <span className="num" style={{ fontSize: "11.5px", opacity: 0.7 }}>
              {t.count}
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px",
        fontSize: "13px",
        color: "var(--fg3)",
      }}
    >
      {label}
    </div>
  );
}
