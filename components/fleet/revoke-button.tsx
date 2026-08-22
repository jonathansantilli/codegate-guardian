"use client";

import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { API_BASE } from "@/lib/security/fleet-api";
import { Ic } from "./icons";
import { Card, CardHead } from "./ui";

/**
 * Withdrawing or restoring a machine's enrolment.
 *
 * Confirmed rather than immediate, because the wording is the part that
 * matters: this closes the door on the server and does not reach the machine.
 * An operator who expects it to stop the agent needs to be told otherwise
 * before they click, not after.
 */
export function RevokeButton({
  hostId,
  hostname,
  revokedAt,
}: {
  hostId: string;
  hostname: string;
  revokedAt: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const revoked = Boolean(revokedAt);

  async function submit() {
    setSaving(true);
    const response = await fetch(`${API_BASE}/machines`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hostId, revoked: !revoked }),
    });
    setSaving(false);

    if (response.ok) {
      toast.success(
        revoked
          ? "Restored. Its next report will be accepted."
          : "Revoked. Its next report will be refused."
      );
      mutate(`${API_BASE}/host?hostId=${hostId}`);
      mutate(API_BASE);
      mutate(`${API_BASE}/overview`);
      setConfirming(false);
    } else {
      toast.error("Could not change the enrolment.");
    }
  }

  return (
    <>
      <button
        className={`btn sm ${revoked ? "btn-outline" : "btn-danger"}`}
        onClick={() => setConfirming(true)}
        type="button"
      >
        <Ic name={revoked ? "refresh" : "shieldOff"} size={14} />
        {revoked ? "Restore enrolment" : "Revoke enrolment"}
      </button>

      {confirming && (
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
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop; the panel takes focus. */}
          <div
            aria-hidden="true"
            onClick={() => setConfirming(false)}
            style={{ position: "absolute", inset: 0 }}
          />
          <Card style={{ width: "460px", maxWidth: "100%", zIndex: 1 }}>
            <CardHead
              title={revoked ? "Restore enrolment" : "Revoke enrolment"}
            />
            <div
              style={{
                padding: "16px 18px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--fg2)",
                  lineHeight: 1.55,
                }}
              >
                {revoked ? (
                  <>
                    This server will accept reports from <b>{hostname}</b>{" "}
                    again. Whatever it has installed now will appear at its next
                    check-in.
                  </>
                ) : (
                  <>
                    This server will refuse reports from <b>{hostname}</b>. It
                    does not reach the machine — the agent there keeps running
                    and keeps trying, and nothing installed on it changes.
                  </>
                )}
              </p>
              {!revoked && (
                <p
                  style={{
                    fontSize: "12.5px",
                    color: "var(--fg3)",
                    lineHeight: 1.5,
                  }}
                >
                  What it last reported stays here, so you can still see what
                  was on it. To stop the agent, someone has to do that on the
                  machine.
                </p>
              )}
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  className="btn sm btn-ghost"
                  onClick={() => setConfirming(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={`btn sm ${revoked ? "btn-primary" : "btn-danger"}`}
                  disabled={saving}
                  onClick={submit}
                  type="button"
                >
                  {saving
                    ? "Saving…"
                    : revoked
                      ? "Restore enrolment"
                      : "Revoke enrolment"}
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
