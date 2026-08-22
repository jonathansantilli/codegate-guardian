"use client";

import { useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";
import { API_BASE } from "@/lib/security/fleet-api";
import { fetcher } from "@/lib/utils";
import { Ic } from "./icons";
import { Card, CardHead, Empty, KV, Loading, Stat } from "./ui";

/**
 * Policies: rules this server checks each arriving report against.
 *
 * Nothing here reaches a machine. A policy turns reports you already have
 * into a pass or a fail per machine, and the fix happens on the machine.
 */

type Policy = {
  id: string;
  name: string;
  description: string | null;
  ruleId: string;
  severity: string;
  version: number;
  enabled: boolean;
  createdBy: string;
  updatedAt: string;
  violatingMachines: number;
  evaluatedMachines: number;
};

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

/** Rules worth starting from, named the way an operator would describe them. */
const TEMPLATES: {
  name: string;
  ruleId: string;
  severity: string;
  description: string;
}[] = [
  {
    name: "Flag known-malicious files",
    ruleId: "known-malicious-content",
    severity: "CRITICAL",
    description:
      "A file whose hash matches an indicator in the signed content feed.",
  },
  {
    name: "Base URL overrides",
    ruleId: "env-base-url-override",
    severity: "CRITICAL",
    description:
      "A config that redirects agent traffic and credentials to a third party.",
  },
  {
    name: "Hidden characters in instruction files",
    ruleId: "rule-file-hidden-unicode",
    severity: "HIGH",
    description:
      "Invisible characters in a rules file — instructions a reviewer cannot see.",
  },
];

type Draft = {
  id?: string;
  name: string;
  ruleId: string;
  severity: string;
  description: string;
  enabled: boolean;
};

const BLANK: Draft = {
  name: "",
  ruleId: "",
  severity: "CRITICAL",
  description: "",
  enabled: true,
};

export function PoliciesScreen() {
  const { data, isLoading } = useSWR<{ policies: Policy[] }>(
    `${API_BASE}/policies`,
    fetcher
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const policies = data?.policies ?? [];
  const current =
    policies.find((p) => p.id === selected) ?? policies[0] ?? null;

  async function save(next: Draft) {
    setSaving(true);
    const response = await fetch(`${API_BASE}/policies`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(next.id ? { id: next.id } : {}),
        name: next.name,
        ruleId: next.ruleId,
        severity: next.severity,
        description: next.description || undefined,
        enabled: next.enabled,
      }),
    });
    setSaving(false);

    if (response.ok) {
      toast.success("Saved. It is evaluated against every report from now on.");
      setDraft(null);
      mutate(`${API_BASE}/policies`);
    } else {
      const body = await response.json().catch(() => null);
      toast.error(body?.error ?? "Could not save the policy.");
    }
  }

  if (isLoading) {
    return <Loading label="Loading policies…" />;
  }

  if (policies.length === 0 && !draft) {
    return (
      <Empty
        actions={
          <button
            className="btn btn-primary"
            onClick={() => setDraft(BLANK)}
            type="button"
          >
            Create a policy
          </button>
        }
        blurb="A policy is a rule this server checks each report against. Machines that break it show up as findings here — nothing is sent to the machine, and nothing is blocked."
        extra={
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              marginTop: "10px",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              overflow: "hidden",
              textAlign: "left",
            }}
          >
            {TEMPLATES.map((template, index) => (
              <button
                className="rowbtn"
                key={template.ruleId}
                onClick={() => setDraft({ ...BLANK, ...template })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "11px 14px",
                  background: "var(--card)",
                  ...(index > 0
                    ? { borderTop: "1px solid var(--border)" }
                    : {}),
                }}
                type="button"
              >
                <span style={{ color: "var(--fg3)", display: "flex" }}>
                  <Ic name="policies" size={15} />
                </span>
                <span style={{ fontSize: "13px" }}>{template.name}</span>
                {index === 0 && (
                  <span className="badge b-sec" style={{ marginLeft: "auto" }}>
                    Recommended
                  </span>
                )}
              </button>
            ))}
          </div>
        }
        icon="policies"
        title="No policies yet"
      />
    );
  }

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
          flexShrink: 0,
        }}
      >
        <Ic name="policies" size={15} />
        <span style={{ fontSize: "13px", color: "var(--fg2)" }}>
          <b style={{ color: "var(--fg)", fontWeight: 600 }}>
            Policies describe; they do not enforce.
          </b>{" "}
          Every rule is evaluated here, against what each machine reported.
          Guardian cannot block an action or change a file on a laptop — the
          owner does that, and the next report confirms it.
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "296px minmax(0,1fr)",
          gap: "16px",
          flex: 1,
          minHeight: 0,
        }}
      >
        <Card grow style={{ overflow: "hidden" }}>
          <CardHead
            action={
              <button
                className="btn xs btn-outline"
                onClick={() => setDraft(BLANK)}
                type="button"
              >
                <Ic name="plus" size={12} /> New
              </button>
            }
            title="Policies"
          />
          <div style={{ overflow: "auto", minHeight: 0 }}>
            {policies.map((policy) => {
              const on = !draft && policy.id === current?.id;
              const violating = policy.violatingMachines;
              return (
                <button
                  className="rowbtn"
                  key={policy.id}
                  onClick={() => {
                    setDraft(null);
                    setSelected(policy.id);
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "5px",
                    padding: "13px 15px",
                    borderBottom:
                      "1px solid color-mix(in oklch, var(--border) 55%, transparent)",
                    ...(on ? { background: "var(--muted)" } : {}),
                  }}
                  type="button"
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      width: "100%",
                    }}
                  >
                    <span
                      className="trunc"
                      style={{ fontSize: "13.5px", fontWeight: 500 }}
                    >
                      {policy.name}
                    </span>
                    <span
                      className={`badge ${policy.enabled ? (violating > 0 ? "b-crit" : "b-ok") : "b-out"}`}
                      style={{ marginLeft: "auto" }}
                    >
                      v{policy.version}
                    </span>
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--fg3)" }}>
                    {policy.enabled
                      ? violating > 0
                        ? `${violating} machine${violating === 1 ? "" : "s"} violating`
                        : "All machines pass"
                      : "Disabled · not evaluated"}
                  </span>
                </button>
              );
            })}
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
          {draft ? (
            <PolicyEditor
              draft={draft}
              onCancel={() => setDraft(null)}
              onChange={setDraft}
              onSave={() => save(draft)}
              saving={saving}
            />
          ) : current ? (
            <>
              <Card>
                <CardHead
                  action={
                    <button
                      className="btn xs btn-outline"
                      onClick={() =>
                        setDraft({
                          id: current.id,
                          name: current.name,
                          ruleId: current.ruleId,
                          severity: current.severity,
                          description: current.description ?? "",
                          enabled: current.enabled,
                        })
                      }
                      type="button"
                    >
                      Edit
                    </button>
                  }
                  note="What counts as a violation when a report arrives"
                  title="Rule"
                />
                <div
                  style={{
                    padding: "16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 200px 200px",
                      gap: "14px",
                    }}
                  >
                    <KV k="Name" v={current.name} />
                    <KV k="Applies to" v="Every machine that reports" />
                    <KV k="Report as" v={current.severity} />
                  </div>
                  <div className="code">
                    {`match   finding.rule_id == "${current.ruleId}"\nonFail  report(${current.severity.toLowerCase()})`}
                  </div>
                  {current.description && (
                    <span
                      style={{
                        fontSize: "13px",
                        color: "var(--fg2)",
                        lineHeight: 1.55,
                      }}
                    >
                      {current.description}
                    </span>
                  )}
                </div>
              </Card>

              <Card grow>
                <CardHead
                  note="Evaluated here, against the latest report from each machine"
                  title="Compliance"
                />
                <Compliance policy={current} />
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Compliance({ policy }: { policy: Policy }) {
  const evaluated = policy.evaluatedMachines;
  const violating = policy.violatingMachines;
  const passing = Math.max(0, evaluated - violating);
  const pct = evaluated === 0 ? 0 : (passing / evaluated) * 100;

  return (
    <div
      style={{
        padding: "18px",
        display: "flex",
        flexDirection: "column",
        gap: "18px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0,1fr))",
          gap: "14px",
        }}
      >
        <Stat label="Passing" sub={`${pct.toFixed(1)}%`} value={passing} />
        <Stat
          label="Violating"
          sub="machines"
          tone={violating > 0 ? "var(--crit)" : undefined}
          value={violating}
        />
        <Stat label="Evaluated" sub="machines reporting" value={evaluated} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        <div
          style={{
            height: "8px",
            borderRadius: "999px",
            background: "var(--muted)",
            overflow: "hidden",
            display: "flex",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "var(--fg)",
            }}
          />
          <div
            style={{
              width: `${100 - pct}%`,
              height: "100%",
              background: "var(--crit)",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: "12px",
            color: "var(--fg3)",
            flexWrap: "wrap",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="dot" style={{ background: "var(--fg)" }} />
            Passing
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="dot" style={{ background: "var(--crit)" }} />
            Violating
          </span>
          <span style={{ marginLeft: "auto" }}>
            Remediation happens on the machine, by its owner.
          </span>
        </div>
      </div>
    </div>
  );
}

function PolicyEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const valid = draft.name.trim() !== "" && draft.ruleId.trim() !== "";

  return (
    <Card>
      <CardHead
        action={
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="btn sm btn-ghost"
              onClick={onCancel}
              type="button"
            >
              Discard
            </button>
            <button
              className="btn sm btn-primary"
              disabled={!valid || saving}
              onClick={onSave}
              type="button"
            >
              {saving ? "Saving…" : "Save rule"}
            </button>
          </div>
        }
        note="What counts as a violation when a report arrives"
        title={draft.id ? "Edit rule" : "New rule"}
      />
      <div
        style={{
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 200px",
            gap: "14px",
          }}
        >
          <div className="kv">
            <span className="k">Name</span>
            <input
              className="input"
              onChange={(event) =>
                onChange({ ...draft, name: event.target.value })
              }
              placeholder="Unpinned MCP servers"
              style={{ height: "36px" }}
              value={draft.name}
            />
          </div>
          <div className="kv">
            <span className="k">Report as</span>
            <select
              className="input"
              onChange={(event) =>
                onChange({ ...draft, severity: event.target.value })
              }
              style={{ height: "36px" }}
              value={draft.severity}
            >
              {SEVERITIES.map((sev) => (
                <option key={sev} value={sev}>
                  {sev}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="kv">
          <span className="k">Rule id a report must carry to violate this</span>
          <input
            className="input mono"
            onChange={(event) =>
              onChange({ ...draft, ruleId: event.target.value })
            }
            placeholder="mcp-server-unpinned"
            style={{ height: "36px" }}
            value={draft.ruleId}
          />
        </div>

        <div className="kv">
          <span className="k">Why it matters</span>
          <textarea
            className="ta"
            onChange={(event) =>
              onChange({ ...draft, description: event.target.value })
            }
            placeholder="An unpinned version lets the server code change without approval."
            value={draft.description}
          />
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "9px",
            fontSize: "13px",
          }}
        >
          <input
            checked={draft.enabled}
            onChange={(event) =>
              onChange({ ...draft, enabled: event.target.checked })
            }
            type="checkbox"
          />
          Evaluate this rule against arriving reports
        </label>
      </div>
    </Card>
  );
}
