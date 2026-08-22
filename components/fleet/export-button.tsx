"use client";

import { useState } from "react";
import { API_BASE } from "@/lib/security/fleet-api";
import type { ExportKind } from "@/lib/security/fleet-export";
import { Ic } from "./icons";

/**
 * Takes the current screen's data away.
 *
 * A plain link rather than a fetch-and-blob: the browser handles the
 * download, and the URL in the menu is the one to put in a script.
 */
export function ExportButton({
  kind,
  hostId,
  label = "Export",
}: {
  kind: ExportKind;
  hostId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const query = new URLSearchParams({ kind, ...(hostId ? { hostId } : {}) });

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn sm btn-outline"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <Ic name="ext" size={14} /> {label}
      </button>

      {open && (
        <>
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: closing backdrop; the menu items below are focusable. */}
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 30 }}
          />
          <div
            className="card"
            style={{
              position: "absolute",
              top: "38px",
              right: 0,
              zIndex: 31,
              padding: "4px",
              gap: "1px",
              minWidth: "160px",
            }}
          >
            {(["csv", "json"] as const).map((format) => (
              <a
                className="rowbtn"
                download
                href={`${API_BASE}/export?${query.toString()}&format=${format}`}
                key={format}
                onClick={() => setOpen(false)}
                style={{
                  borderRadius: "8px",
                  padding: "7px 9px",
                  fontSize: "13px",
                }}
              >
                {format.toUpperCase()}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
