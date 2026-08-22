"use client";

import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { API_BASE } from "@/lib/security/fleet-api";

/**
 * Who is accountable for a machine.
 *
 * Display data an operator maintains. It grants nothing and controls nothing —
 * but it is what turns "a laptop has a malicious skill" into a conversation
 * with a person, which is the only way anything gets fixed here.
 */

export function OwnerForm({
  hostId,
  owner,
  team,
  onDone,
}: {
  hostId: string;
  owner: string | null;
  team: string | null;
  onDone: () => void;
}) {
  const [nextOwner, setNextOwner] = useState(owner ?? "");
  const [nextTeam, setNextTeam] = useState(team ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const response = await fetch(`${API_BASE}/owner`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hostId,
        owner: nextOwner.trim() || null,
        team: nextTeam.trim() || null,
      }),
    });
    setSaving(false);

    if (response.ok) {
      toast.success("Saved.");
      mutate(`${API_BASE}/host?hostId=${hostId}`);
      mutate(`${API_BASE}`);
      mutate(`${API_BASE}/attention`);
      onDone();
    } else {
      toast.error("Could not save the owner.");
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "10px",
        flexWrap: "wrap",
      }}
    >
      <div className="kv" style={{ minWidth: "180px" }}>
        <span className="k">Owner</span>
        <input
          className="input"
          onChange={(event) => setNextOwner(event.target.value)}
          placeholder="Unassigned"
          style={{ height: "32px" }}
          value={nextOwner}
        />
      </div>
      <div className="kv" style={{ minWidth: "160px" }}>
        <span className="k">Team</span>
        <input
          className="input"
          onChange={(event) => setNextTeam(event.target.value)}
          placeholder="No team"
          style={{ height: "32px" }}
          value={nextTeam}
        />
      </div>
      <button
        className="btn sm btn-primary"
        disabled={saving}
        onClick={save}
        type="button"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button className="btn sm btn-ghost" onClick={onDone} type="button">
        Cancel
      </button>
    </div>
  );
}
