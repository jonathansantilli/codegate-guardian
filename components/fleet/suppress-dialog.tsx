"use client";

import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { API_BASE } from "@/lib/security/fleet-api";
import { Card, CardHead } from "./ui";

/**
 * Silencing a finding, with the reason recorded.
 *
 * A suppression hides a finding from the queue but changes nothing on any
 * machine — the file is still there and the next report still carries it. The
 * reason is mandatory: a silence nobody explained is one nobody can review.
 */

/** Offered expiries. Permanent is possible but has to be chosen deliberately. */
const DURATIONS: { label: string; days: number | null }[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "Until revoked", days: null },
];

export type SuppressTarget = {
  /** The exact finding, when silencing one thing. */
  fingerprint?: string;
  /** The rule, when silencing a class of findings. */
  ruleId?: string;
  /** Set to silence on one machine only; absent means the whole fleet. */
  hostId?: string;
  /** What the operator is looking at, shown back to them. */
  label: string;
  /** How many machines this silences right now. */
  blastRadius?: number;
};

export function SuppressDialog({
  target,
  onClose,
}: {
  target: SuppressTarget;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [days, setDays] = useState<number | null>(30);
  const [saving, setSaving] = useState(false);

  const scope = target.hostId ? "machine" : "fleet";

  async function submit() {
    setSaving(true);
    const response = await fetch(`${API_BASE}/suppressions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope,
        ...(target.hostId ? { hostId: target.hostId } : {}),
        ...(target.fingerprint ? { fingerprint: target.fingerprint } : {}),
        ...(target.ruleId ? { ruleId: target.ruleId } : {}),
        reason: reason.trim(),
        ...(days === null
          ? {}
          : {
              expiresAt: new Date(
                Date.now() + days * 24 * 60 * 60 * 1000
              ).toISOString(),
            }),
      }),
    });
    setSaving(false);

    if (response.ok) {
      toast.success(
        "Suppressed. The machines still report it; this console stops asking."
      );
      mutate(`${API_BASE}/findings`);
      mutate(`${API_BASE}/attention`);
      mutate(`${API_BASE}/suppressions`);
      onClose();
    } else {
      const body = await response.json().catch(() => null);
      toast.error(body?.error ?? "Could not record the suppression.");
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "color-mix(in oklch, var(--fg) 22%, transparent)",
      }}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ position: "absolute", inset: 0 }}
      />
      <Card style={{ width: "520px", maxWidth: "100%", zIndex: 1 }}>
        <CardHead
          note={
            scope === "fleet"
              ? "Across the whole fleet"
              : "On this machine only"
          }
          title="Suppress"
        />
        <div
          style={{
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div className="kv">
            <span className="k">What is being silenced</span>
            <span className="v trunc">{target.label}</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "9px",
              padding: "11px 12px",
              borderRadius: "9px",
              background: "var(--muted)",
              fontSize: "12.5px",
              color: "var(--fg2)",
              lineHeight: 1.5,
            }}
          >
            This hides it from the queue. Nothing changes on
            {target.blastRadius === undefined
              ? " any machine"
              : ` the ${target.blastRadius} machine${target.blastRadius === 1 ? "" : "s"} carrying it`}
            — the file is still there and the next report still carries it.
          </div>

          <div className="kv">
            <span className="k">Why (recorded, and required)</span>
            <textarea
              className="ta"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reviewed with the owner — this is a false positive on our internal tooling."
              value={reason}
            />
          </div>

          <div className="kv">
            <span className="k">Expires</span>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {DURATIONS.map((duration) => (
                <button
                  className={`chip${days === duration.days ? " on" : ""}`}
                  key={duration.label}
                  onClick={() => setDays(duration.days)}
                  type="button"
                >
                  {duration.label}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}
          >
            <button
              className="btn sm btn-ghost"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="btn sm btn-primary"
              disabled={saving || reason.trim() === ""}
              onClick={submit}
              type="button"
            >
              {saving ? "Saving…" : "Suppress"}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
