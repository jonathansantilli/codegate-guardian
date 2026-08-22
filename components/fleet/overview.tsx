"use client";

import Link from "next/link";
import useSWR from "swr";
import { API_BASE } from "@/lib/security/fleet-api";
import {
  displayPath,
  formatRelativeTime,
} from "@/lib/security/fleet-presentation";
import { fetcher } from "@/lib/utils";
import { CheckInChart } from "./check-in-chart";
import { Ic } from "./icons";
import {
  Api,
  Avatar,
  Badge,
  Card,
  CardHead,
  Code,
  Dot,
  KV,
  Loading,
  Stat,
  StatGrid,
  sevColor,
} from "./ui";

/**
 * The overview answers one question: what needs me first.
 *
 * It has three faces, and which one shows is derived, never configured — an
 * install with no machines is being set up, an install whose check-ins are
 * being rejected is broken, and anything else is working.
 */

type Overview = {
  hostsEnrolled: number;
  hostsReporting: number;
  ownersWithOpenFindings: number;
  teamsWithOpenFindings: number;
  openFindings: number;
  untriagedFindings: number;
  checkInsPerHour: { hour: string; count: number }[];
  lastCheckInAt: string | null;
  machinesWithFindings: number;
  attentionTotal: number;
  hostsRevoked: number;
  rejections: {
    hostname: string;
    owner: string | null;
    reason: string;
    at: string;
  }[];
  contentFeed: { version: string | null; ageDays: number | null };
};

type Attention = {
  hostId: string;
  hostname: string;
  owner: string | null;
  team: string | null;
  fingerprint: string;
  ruleId: string;
  severity: string;
  description: string;
  filePath: string | null;
  lastSeenAt: string;
};

type Policy = { id: string; name: string; ruleId: string; enabled: boolean };

/** A feed older than this is worth flagging; detection still runs regardless. */
const FEED_STALE_DAYS = 7;

export function OverviewScreen() {
  const { data: overview, isLoading } = useSWR<Overview>(
    `${API_BASE}/overview`,
    fetcher,
    { refreshInterval: 30_000 }
  );
  const { data: attention } = useSWR<{ attention: Attention[] }>(
    `${API_BASE}/attention`,
    fetcher,
    { refreshInterval: 30_000 }
  );
  const { data: policyData } = useSWR<{ policies: Policy[] }>(
    `${API_BASE}/policies`,
    fetcher
  );

  if (isLoading || !overview) {
    return <Loading label="Loading the fleet…" />;
  }

  if (overview.hostsEnrolled === 0) {
    return <FirstRun rejections={overview.rejections.length} />;
  }

  const feedStale =
    overview.contentFeed.ageDays !== null &&
    overview.contentFeed.ageDays >= FEED_STALE_DAYS;

  // A revoked machine keeps reporting and keeps being refused: that is
  // revocation working, not a service outage, so it must not replace the
  // console with a Problems screen that then lists nothing.
  const faults = overview.rejections.filter(
    (rejection) => !rejection.reason.includes("enrolment_revoked")
  );

  if (faults.length > 0 || feedStale) {
    return <Degraded faults={faults} overview={overview} />;
  }

  return (
    <Active
      attention={attention?.attention ?? []}
      overview={overview}
      policies={policyData?.policies ?? []}
    />
  );
}

/* ---------------------------------------------------------------- *
 * First run — nothing has ever reported.
 * ---------------------------------------------------------------- */

function Step({
  n,
  title,
  blurb,
  children,
}: {
  n: number;
  title: string;
  blurb: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: "14px" }}>
      <div
        style={{
          width: "24px",
          height: "24px",
          borderRadius: "999px",
          background: "var(--fg)",
          color: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "12px",
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {n}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "7px",
          flex: 1,
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: "14px", fontWeight: 500 }}>{title}</span>
        <span
          style={{ fontSize: "13px", color: "var(--fg3)", lineHeight: 1.55 }}
        >
          {blurb}
        </span>
        {children}
      </div>
    </div>
  );
}

function FirstRun({ rejections }: { rejections: number }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px",
      }}
    >
      <div
        style={{
          width: "660px",
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "22px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
          <h2 style={{ fontSize: "21px" }}>Connect your first machine</h2>
          <p
            style={{ fontSize: "13.5px", color: "var(--fg3)", lineHeight: 1.6 }}
          >
            CodeGate runs on each developer machine and reports what AI tooling
            is installed there. This server only receives those reports — it
            never sends anything back to a machine. Nothing appears here until a
            machine checks in, which takes about a minute.
          </p>
        </div>

        <Card style={{ padding: "22px", gap: "22px" }}>
          <Step
            blurb="It is what ties a machine to this server. Set how many machines may use it and when it expires."
            n={1}
            title="Create an enrolment code"
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "9px",
                marginTop: "2px",
              }}
            >
              <Link className="btn sm btn-primary" href="/fleet/access">
                Generate code
              </Link>
              <Api method="POST" path="/api/fleet/enrolment" />
            </div>
          </Step>

          <Step
            blurb="Install the agent and enrol it in a single step."
            n={2}
            title="Run one command on that machine"
          >
            <Code>
              {"npx codegate-ai enrol \\\n  --server "}
              <span className="kw">https://guardian.example.internal</span>
              {" \\\n  --code   "}
              <span className="kw">FLEET-XXXX-XXXX</span>
            </Code>
          </Step>

          <Step
            blurb="The agent reports immediately, then every six hours. This page fills in on its own."
            n={3}
            title="Wait for the first check-in"
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "9px",
                padding: "9px 12px",
                borderRadius: "9px",
                background: "var(--muted)",
                marginTop: "2px",
                width: "fit-content",
              }}
            >
              <Dot color={rejections > 0 ? "var(--crit)" : "var(--fg3)"} />
              <span style={{ fontSize: "12.5px", color: "var(--fg2)" }}>
                {rejections > 0
                  ? `${rejections} check-in${rejections === 1 ? "" : "s"} rejected in the last hour — see API & access`
                  : "Listening for machines…"}
              </span>
            </div>
          </Step>
        </Card>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "13px 16px",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            background: "var(--card)",
          }}
        >
          <Ic name="machines" />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "2px",
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 500 }}>
              Rolling out to a whole team?
            </span>
            <span style={{ fontSize: "12.5px", color: "var(--fg3)" }}>
              Ship the server URL and a multi-use code through your MDM or
              configuration management instead.
            </span>
          </div>
          <Link
            className="btn sm btn-outline"
            href="/fleet/access"
            style={{ marginLeft: "auto", flexShrink: 0 }}
          >
            Mint a shared code
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * Degraded — the fleet exists but this server is not hearing from it.
 * ---------------------------------------------------------------- */

function Problem({
  tone,
  toneBg,
  label,
  title,
  effect,
  fix,
}: {
  tone: string;
  toneBg: string;
  label: string;
  title: string;
  effect: string;
  fix: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "13px",
        padding: "14px 16px",
        borderBottom:
          "1px solid color-mix(in oklch, var(--border) 55%, transparent)",
      }}
    >
      <div
        style={{
          width: "26px",
          height: "26px",
          borderRadius: "8px",
          background: toneBg,
          color: tone,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: "1px",
        }}
      >
        <Ic name="findings" size={14} />
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "3px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "13.5px", fontWeight: 500 }}>{title}</span>
          <span className="badge b-sec mono" style={{ fontSize: "11px" }}>
            {label}
          </span>
        </div>
        <span
          style={{ fontSize: "12.5px", color: "var(--fg3)", lineHeight: 1.5 }}
        >
          {effect}
        </span>
      </div>
      {fix}
    </div>
  );
}

function Degraded({
  overview,
  faults,
}: {
  overview: Overview;
  /** Rejections that mean something is broken, not that revocation worked. */
  faults: Overview["rejections"];
}) {
  const noToken = faults.some((r) => r.reason.includes("no_token_configured"));
  const badToken = faults.some((r) => r.reason.includes("unknown_token"));
  const feedDays = overview.contentFeed.ageDays;
  const feedStale = feedDays !== null && feedDays >= FEED_STALE_DAYS;
  const problems = [noToken, badToken, feedStale].filter(Boolean).length;

  return (
    <>
      <Card>
        <CardHead
          badge={<Badge tone="crit">{problems}</Badge>}
          note="Configuration and service health — not findings on your fleet"
          title="Problems"
        />
        {noToken && (
          <Problem
            effect="AGENT_INGEST_TOKEN is empty, so every agent check-in is rejected with 401. No machine can report until it is set."
            fix={
              <Link className="btn sm btn-outline" href="/fleet/access">
                How to set it
              </Link>
            }
            label="configuration"
            title="Ingest token is not set"
            tone="var(--crit)"
            toneBg="var(--crit-bg)"
          />
        )}
        {badToken && (
          <Problem
            effect="Machines are presenting a token this server does not accept. They were enrolled against a different token, or it was rotated here without being rotated on them."
            fix={
              <Link className="btn sm btn-outline" href="/fleet/access">
                Review tokens
              </Link>
            }
            label="configuration"
            title="Agents are presenting a token this server rejects"
            tone="var(--crit)"
            toneBg="var(--crit-bg)"
          />
        )}
        {feedStale && (
          <Problem
            effect={`The newest feed any machine reports is ${overview.contentFeed.version}, ${feedDays} days old. Detection still runs, but against older indicators.`}
            fix={
              <span
                className="btn sm btn-outline"
                style={{ cursor: "default" }}
              >
                Update on the machine
              </span>
            }
            label="service"
            title={`Content feed is ${feedDays} days stale`}
            tone="var(--warn)"
            toneBg="var(--warn-bg)"
          />
        )}
      </Card>

      <StatGrid>
        <Stat
          label="Reporting"
          sub={`of ${overview.hostsEnrolled} active${overview.hostsRevoked > 0 ? ` · ${overview.hostsRevoked} revoked` : ""}`}
          tone={overview.hostsReporting === 0 ? "var(--crit)" : undefined}
          value={overview.hostsReporting}
        />
        <Stat
          label="Last check-in"
          sub={overview.lastCheckInAt ? "ago" : "none yet"}
          value={
            overview.lastCheckInAt
              ? formatRelativeTime(new Date(overview.lastCheckInAt)).replace(
                  " ago",
                  ""
                )
              : "—"
          }
        />
        <Stat
          label="Rejected check-ins"
          sub="last hour"
          tone="var(--crit)"
          value={faults.length}
        />
        <Stat
          label="Feed age"
          sub={feedDays === null ? "unknown" : feedStale ? "stale" : "current"}
          tone={feedStale ? "var(--warn)" : undefined}
          value={feedDays === null ? "—" : `${feedDays}d`}
        />
      </StatGrid>

      {faults.length > 0 && (
        <Card grow>
          <CardHead
            note="A refused check-in carries no identity — only why it was refused"
            title="Recent rejections"
          />
          <div style={{ overflow: "auto", minHeight: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Reason</th>
                  <th className="r">When</th>
                </tr>
              </thead>
              <tbody>
                {faults.map((row) => (
                  <tr key={`${row.hostname}-${row.at}`}>
                    <td style={{ fontWeight: 500 }}>{row.hostname}</td>
                    <td
                      style={{ color: row.owner ? "var(--fg2)" : "var(--fg3)" }}
                    >
                      {row.owner ?? "Unassigned"}
                    </td>
                    <td
                      className="mono"
                      style={{ fontSize: "12.5px", color: "var(--crit)" }}
                    >
                      {row.reason}
                    </td>
                    <td
                      className="r mono"
                      style={{ fontSize: "12px", color: "var(--fg3)" }}
                    >
                      {formatRelativeTime(new Date(row.at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- *
 * Active — machine and person first, reason third.
 * ---------------------------------------------------------------- */

function AttentionRow({ row }: { row: Attention }) {
  const who = row.owner ?? row.hostname;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "13px",
        padding: "12px 16px",
        borderBottom:
          "1px solid color-mix(in oklch, var(--border) 55%, transparent)",
      }}
    >
      <Avatar name={who} size={30} />
      <div
        style={{
          width: "196px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          minWidth: 0,
        }}
      >
        <span className="trunc" style={{ fontWeight: 500, fontSize: "13.5px" }}>
          {row.hostname}
        </span>
        <span
          className="trunc"
          style={{ fontSize: "12px", color: "var(--fg3)" }}
        >
          {row.owner ?? "Unassigned"} · {row.team ?? "No team"}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <Dot color={sevColor(row.severity)} />
          <span className="trunc" style={{ fontSize: "13px", fontWeight: 500 }}>
            {row.description}
          </span>
        </div>
        <span
          className="mono trunc"
          style={{ fontSize: "11.5px", color: "var(--fg3)" }}
        >
          {row.filePath ? displayPath(row.filePath) : row.ruleId}
        </span>
      </div>
      <Link
        className="btn sm btn-primary"
        href={
          row.filePath
            ? `/fleet/machines/${row.hostId}/file?path=${encodeURIComponent(row.filePath)}`
            : `/fleet/machines/${row.hostId}`
        }
      >
        Open
      </Link>
    </div>
  );
}

function Active({
  overview,
  attention,
  policies,
}: {
  overview: Overview;
  attention: Attention[];
  policies: Policy[];
}) {
  const worst = attention.slice(0, 6);
  const passing = Math.max(
    0,
    overview.hostsEnrolled - overview.machinesWithFindings
  );

  return (
    <>
      <StatGrid>
        <Stat
          label="Reporting"
          sub={`of ${overview.hostsEnrolled} active${overview.hostsRevoked > 0 ? ` · ${overview.hostsRevoked} revoked` : ""}`}
          value={overview.hostsReporting}
        />
        <Stat
          label="Owners with open findings"
          sub={`across ${overview.teamsWithOpenFindings} team${overview.teamsWithOpenFindings === 1 ? "" : "s"}`}
          tone={overview.ownersWithOpenFindings > 0 ? "var(--crit)" : undefined}
          value={overview.ownersWithOpenFindings}
        />
        <Stat
          label="Machines passing all policies"
          // Counted server-side over the whole fleet. Deriving it from the
          // attention list read "75% passing" on 200 machines that all failed,
          // because that list stops at 50.
          sub={`${passing} of ${overview.hostsEnrolled}`}
          value={
            overview.hostsEnrolled === 0
              ? "—"
              : `${Math.round((passing / overview.hostsEnrolled) * 100)}%`
          }
        />
        <Stat
          label="Untriaged"
          // Machine-and-finding pairs, matching the queue below it, because
          // acknowledging is something you do per machine.
          sub={`of ${overview.attentionTotal} to act on`}
          value={overview.untriagedFindings}
        />
      </StatGrid>

      <Card>
        <CardHead
          action={
            <Link className="btn xs btn-outline" href="/fleet/findings">
              Group by finding
            </Link>
          }
          badge={
            worst.length > 0 ? (
              <Badge tone="crit">{overview.attentionTotal}</Badge>
            ) : undefined
          }
          note="One row per machine per finding — a laptop each to fix"
          title="Act on these first"
        />
        {worst.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "18px 16px",
              fontSize: "13px",
              color: "var(--fg3)",
            }}
          >
            <Dot color="var(--ok)" />
            Nothing needs you. Every machine that reported was checked against
            the content feed and your policies.
          </div>
        ) : (
          worst.map((row) => (
            <AttentionRow key={`${row.hostId}-${row.fingerprint}`} row={row} />
          ))
        )}
      </Card>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.55fr 1fr",
          gap: "16px",
          flex: 1,
          minHeight: 0,
          // Fills the space the design gives it, without stretching to the
          // height of the whole viewport when the fleet is small.
          maxHeight: "360px",
        }}
      >
        <Card grow>
          <CardHead note="Last 24 hours · UTC" title="Check-ins per hour" />
          <CheckInChart points={overview.checkInsPerHour} />
        </Card>

        <Card grow>
          <CardHead title="Policy compliance" />
          <PolicyCompliance
            attention={attention}
            hostsEnrolled={overview.hostsEnrolled}
            policies={policies}
          />
        </Card>
      </div>
    </>
  );
}

function PolicyCompliance({
  policies,
  attention,
  hostsEnrolled,
}: {
  policies: Policy[];
  attention: Attention[];
  hostsEnrolled: number;
}) {
  const enabled = policies.filter((p) => p.enabled);

  if (enabled.length === 0) {
    return (
      <div
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <span
          style={{ fontSize: "13px", color: "var(--fg3)", lineHeight: 1.55 }}
        >
          No policies yet. A policy names a rule that machines must not report,
          and turns the reports you already have into a pass or fail per
          machine.
        </span>
        <Link
          className="btn sm btn-outline"
          href="/fleet/policies"
          style={{ width: "fit-content" }}
        >
          Write the first one
        </Link>
      </div>
    );
  }

  const policy = enabled[0];
  const failing = new Set(
    attention.filter((a) => a.ruleId === policy.ruleId).map((a) => a.hostId)
  ).size;
  const passing = Math.max(0, hostsEnrolled - failing);
  const pct = hostsEnrolled === 0 ? 0 : (passing / hostsEnrolled) * 100;

  return (
    <div
      style={{
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        overflow: "auto",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        <span style={{ fontWeight: 500 }}>{policy.name}</span>
        <span style={{ fontSize: "12.5px", color: "var(--fg3)" }}>
          Evaluated against every machine’s latest report
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "12.5px",
          }}
        >
          <span style={{ color: "var(--fg3)" }}>Machines passing</span>
          <span className="num" style={{ fontWeight: 500 }}>
            {passing} / {hostsEnrolled}
          </span>
        </div>
        <div
          style={{
            height: "6px",
            borderRadius: "999px",
            background: "var(--muted)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "var(--fg)",
              borderRadius: "999px",
            }}
          />
        </div>
        <span style={{ fontSize: "12px", color: "var(--fg3)" }}>
          {failing === 0
            ? "No machine reports a file that breaks this rule."
            : `${failing} machine${failing === 1 ? " reports" : "s report"} a file that breaks this rule. Guardian flags it here; the fix happens on the machine.`}
        </span>
      </div>
      {enabled.length > 1 && (
        <>
          <div style={{ height: "1px", background: "var(--border)" }} />
          <KV
            k="Other policies"
            v={enabled
              .slice(1)
              .map((p) => p.name)
              .join(", ")}
          />
        </>
      )}
    </div>
  );
}
