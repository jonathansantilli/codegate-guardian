"use client";

import { useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";
import { API_BASE } from "@/lib/security/fleet-api";
import { formatRelativeTime } from "@/lib/security/fleet-presentation";
import { fetcher } from "@/lib/utils";
import { Ic } from "./icons";
import { Badge, Card, CardHead, Loading } from "./ui";

/**
 * API & access.
 *
 * The console is a client of this API and nothing more, so the endpoints it
 * uses are listed as they are, not as a wish list — anything on this page can
 * be driven by a script or an agent with the same call.
 */

type EnrolmentCode = {
  id: string;
  code: string;
  label: string | null;
  maxUses: number;
  usedCount: number;
  createdBy: string;
  expiresAt: string;
  revokedAt: string | null;
  usable: boolean;
};

/** Every route the console itself calls, grouped the way a reader scans them. */
const ENDPOINTS: { method: string; path: string; desc: string }[] = [
  { method: "GET", path: "/api/fleet", desc: "List the fleet" },
  {
    method: "GET",
    path: "/api/fleet/host?hostId=",
    desc: "One machine, its latest report, findings and history",
  },
  {
    method: "GET",
    path: "/api/fleet/overview",
    desc: "Headline numbers and ingest health",
  },
  {
    method: "GET",
    path: "/api/fleet/attention",
    desc: "Machines and owners needing attention, worst first",
  },
  {
    method: "GET",
    path: "/api/fleet/artifacts",
    desc: "Artifacts across the fleet, by hash",
  },
  {
    method: "GET",
    path: "/api/fleet/artifact?contentHash=",
    desc: "One variant: who carries this exact file",
  },
  {
    method: "GET",
    path: "/api/fleet/findings",
    desc: "Findings with derived status",
  },
  {
    method: "POST",
    path: "/api/fleet/acknowledge",
    desc: "Take responsibility for a finding",
  },
  {
    method: "GET",
    path: "/api/fleet/suppressions",
    desc: "Live suppressions and blast radius",
  },
  {
    method: "POST",
    path: "/api/fleet/suppressions",
    desc: "Suppress with a reason and expiry",
  },
  {
    method: "GET",
    path: "/api/fleet/policies",
    desc: "Rules and fleet compliance",
  },
  {
    method: "PUT",
    path: "/api/fleet/policies",
    desc: "Author a rule evaluated on report",
  },
  {
    method: "PUT",
    path: "/api/fleet/owner",
    desc: "Assign a machine's owner and team",
  },
  { method: "GET", path: "/api/fleet/activity", desc: "Audit log" },
  {
    method: "GET",
    path: "/api/fleet/enrolment",
    desc: "Enrolment codes and how far they are used",
  },
  { method: "POST", path: "/api/fleet/enrolment", desc: "Mint a code" },
  {
    method: "POST",
    path: "/api/agent/enrol",
    desc: "Agent redeems a code for its config",
  },
  {
    method: "POST",
    path: "/api/agent/report",
    desc: "Agent reports inventory and findings",
  },
];

const METHOD_TONE: Record<string, string> = {
  GET: "var(--fg2)",
  POST: "var(--fg)",
  PUT: "var(--fg)",
  DELETE: "var(--destructive)",
};

function Copyable({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className="icon-btn"
      onClick={() => {
        navigator.clipboard.writeText(text);
        toast.success("Copied");
      }}
      style={{ marginLeft: "auto" }}
      title="Copy"
      type="button"
    >
      {children}
    </button>
  );
}

export function AccessScreen() {
  const { data, isLoading } = useSWR<{ codes: EnrolmentCode[] }>(
    `${API_BASE}/enrolment`,
    fetcher
  );
  const [minting, setMinting] = useState(false);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const codes = data?.codes ?? [];
  const usable = codes.find((code) => code.usable);
  const enrolCommand = `npx codegate-ai enrol \\\n  --server ${origin || "https://guardian.example.internal"} \\\n  --code   ${usable?.code ?? "FLEET-XXXX-XXXX"}`;

  async function mint(maxUses: number) {
    setMinting(true);
    const response = await fetch(`${API_BASE}/enrolment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        maxUses,
        label: maxUses > 1 ? "Shared rollout code" : "Single machine",
      }),
    });
    setMinting(false);

    if (response.ok) {
      toast.success("Code minted. It expires on its own.");
      mutate(`${API_BASE}/enrolment`);
    } else {
      toast.error("Could not mint a code.");
    }
  }

  if (isLoading) {
    return <Loading label="Loading access…" />;
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "12px 15px",
          borderRadius: "10px",
          border: "1px solid var(--border)",
          background: "var(--card)",
        }}
      >
        <Ic name="api" size={16} />
        <span style={{ fontSize: "13.5px", color: "var(--fg2)" }}>
          <b style={{ color: "var(--fg)", fontWeight: 600 }}>
            This console is a client of the API below.
          </b>{" "}
          Anything you can do here, a script can do with your session cookie.
          Agents have two routes of their own, and their own token.
        </span>
      </div>

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
          <CardHead
            badge={<Badge tone="sec">{ENDPOINTS.length} routes</Badge>}
            title="Endpoints"
          />
          <div style={{ overflow: "auto", minHeight: 0 }}>
            <table className="tbl">
              <tbody>
                {ENDPOINTS.map((endpoint) => (
                  <tr key={`${endpoint.method} ${endpoint.path}`}>
                    <td style={{ width: "74px" }}>
                      <span
                        className="badge mono"
                        style={{
                          background: METHOD_TONE[endpoint.method],
                          color: "var(--bg)",
                          fontSize: "11px",
                        }}
                      >
                        {endpoint.method}
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: "12.5px" }}>
                      {endpoint.path}
                    </td>
                    <td style={{ color: "var(--fg3)", fontSize: "13px" }}>
                      {endpoint.desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            <CardHead
              action={
                <Copyable text={enrolCommand}>
                  <Ic name="copy" size={15} />
                </Copyable>
              }
              title="Enrol a machine"
            />
            <div
              style={{
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div className="code">{enrolCommand}</div>
              <span style={{ fontSize: "12px", color: "var(--fg3)" }}>
                {usable
                  ? `This code has ${usable.maxUses - usable.usedCount} of ${usable.maxUses} uses left and expires ${formatRelativeTime(new Date(usable.expiresAt)).replace(" ago", " from now")}.`
                  : "No usable code right now. Mint one below — the agent exchanges it for a config bound to that machine."}
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="btn sm btn-primary"
                  disabled={minting}
                  onClick={() => mint(1)}
                  type="button"
                >
                  Mint single-use code
                </button>
                <button
                  className="btn sm btn-outline"
                  disabled={minting}
                  onClick={() => mint(50)}
                  type="button"
                >
                  Mint code for a rollout
                </button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHead
              action={
                <Copyable
                  text={`curl -b "authjs.session-token=$CG_SESSION" \\\n    ${origin}/api/fleet/findings`}
                >
                  <Ic name="copy" size={15} />
                </Copyable>
              }
              title="Query it yourself"
            />
            <div style={{ padding: "14px 16px" }}>
              <div className="code">
                {"$ curl -b "}
                <span className="kw">
                  {'"authjs.session-token=$CG_SESSION"'}
                </span>
                {" \\\n    "}
                <span className="kw">{`${origin}/api/fleet/findings`}</span>
                {"\n\n{\n  "}
                <span className="kw">{'"findings"'}</span>
                {": [\n    { "}
                <span className="kw">{'"ruleId"'}</span>
                {": "}
                <span className="kw">{'"known-malicious-content"'}</span>
                {",\n      "}
                <span className="kw">{'"severity"'}</span>
                {": "}
                <span className="kw">{'"CRITICAL"'}</span>
                {",\n      "}
                <span className="kw">{'"machineCount"'}</span>
                {": 3 }\n  ]\n}"}
              </div>
            </div>
          </Card>

          <Card grow style={{ overflow: "hidden" }}>
            <CardHead
              note="A code is the credential a machine presents once, to enrol"
              title="Enrolment codes"
            />
            <div style={{ overflow: "auto", minHeight: 0 }}>
              {codes.length === 0 ? (
                <p
                  style={{
                    padding: "16px",
                    fontSize: "12.5px",
                    color: "var(--fg3)",
                  }}
                >
                  No codes minted yet.
                </p>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Uses</th>
                      <th>Expires</th>
                      <th className="r">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map((code) => (
                      <tr key={code.id}>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "2px",
                            }}
                          >
                            <span
                              className="mono"
                              style={{ fontWeight: 500, fontSize: "13px" }}
                            >
                              {code.code}
                            </span>
                            <span
                              style={{
                                fontSize: "11.5px",
                                color: "var(--fg3)",
                              }}
                            >
                              {code.label ?? "No label"} · {code.createdBy}
                            </span>
                          </div>
                        </td>
                        <td className="num mono" style={{ fontSize: "12.5px" }}>
                          {code.usedCount} / {code.maxUses}
                        </td>
                        <td
                          className="mono"
                          style={{ fontSize: "12.5px", color: "var(--fg3)" }}
                        >
                          {new Date(code.expiresAt).toLocaleString()}
                        </td>
                        <td className="r">
                          <Badge tone={code.usable ? "ok" : "sec"}>
                            {code.revokedAt
                              ? "Revoked"
                              : code.usable
                                ? "Usable"
                                : code.usedCount >= code.maxUses
                                  ? "Exhausted"
                                  : "Expired"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
