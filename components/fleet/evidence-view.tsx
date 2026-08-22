"use client";

import { useState } from "react";

/**
 * The evidence behind a finding: the lines that caused it, in place.
 *
 * Zero-width characters are rendered as visible chips, because a reviewer
 * staring at the raw line sees nothing wrong — that invisibility is the whole
 * attack, so the console has to draw what the eye cannot catch.
 */

const ZERO_WIDTH = /\u200b|\u200c|\u200d|\u2060|\ufeff/g;

const CODEPOINT_LABEL: Record<string, string> = {
  "​": "U+200B",
  "‌": "U+200C",
  "‍": "U+200D",
  "⁠": "U+2060",
  "﻿": "U+FEFF",
};

export function countHiddenCharacters(text: string): number {
  return (text.match(ZERO_WIDTH) ?? []).length;
}

/** Splits a line into plain runs and the invisible characters between them. */
export function revealHidden(
  line: string
): { text: string; hidden: boolean }[] {
  const parts: { text: string; hidden: boolean }[] = [];
  let buffer = "";

  for (const char of line) {
    if (CODEPOINT_LABEL[char]) {
      if (buffer) {
        parts.push({ text: buffer, hidden: false });
        buffer = "";
      }
      parts.push({ text: CODEPOINT_LABEL[char], hidden: true });
    } else {
      buffer += char;
    }
  }
  if (buffer) {
    parts.push({ text: buffer, hidden: false });
  }
  return parts;
}

export function EvidenceView({
  evidence,
  filePath,
  line,
  column,
  contentHash,
}: {
  evidence: string | null;
  filePath: string | null;
  line: number | null;
  column: number | null;
  contentHash: string | null;
}) {
  const hiddenCount = countHiddenCharacters(evidence ?? "");
  const [reveal, setReveal] = useState(hiddenCount > 0);

  if (!evidence) {
    return (
      <p style={{ fontSize: "12.5px", color: "var(--fg3)" }}>
        The agent reported no excerpt for this finding.
      </p>
    );
  }

  // The scanner formats its own excerpt, line numbers included. Rendering it
  // verbatim keeps the console honest about what was actually reported.
  const lines = evidence.split("\n");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "8px",
        }}
      >
        {filePath && (
          <span
            className="mono trunc"
            style={{
              fontSize: "11.5px",
              color: "var(--fg3)",
              maxWidth: "100%",
            }}
          >
            {filePath}
          </span>
        )}
        {line !== null && (
          <span className="badge b-sec mono" style={{ fontSize: "11px" }}>
            line {line}
            {column === null ? "" : `, col ${column}`}
          </span>
        )}
        {hiddenCount > 0 && (
          <button
            className={`tog${reveal ? " on" : ""}`}
            onClick={() => setReveal(!reveal)}
            type="button"
          >
            Show hidden characters
            <span className="num">({hiddenCount})</span>
            <span className="sw">
              <i />
            </span>
          </button>
        )}
      </div>

      <div className="cv" style={{ overflowX: "auto" }}>
        {lines.map((text, index) => (
          <div
            className="cvl"
            // biome-ignore lint/suspicious/noArrayIndexKey: a line's position in the excerpt IS its identity; two identical lines are different lines.
            key={`line-${index}`}
          >
            <span className="cvc">
              {reveal
                ? revealHidden(text).map((part, i) =>
                    part.hidden ? (
                      <span
                        className="zwc"
                        // biome-ignore lint/suspicious/noArrayIndexKey: run order within a line is the only thing distinguishing repeated characters.
                        key={`hidden-${i}`}
                      >
                        {part.text}
                      </span>
                    ) : (
                      // biome-ignore lint/suspicious/noArrayIndexKey: run order within a line is its identity.
                      <span key={`text-${i}`}>{part.text}</span>
                    )
                  )
                : text}
            </span>
          </div>
        ))}
      </div>

      {contentHash && (
        <span
          className="mono trunc"
          style={{ fontSize: "11px", color: "var(--fg3)" }}
          title={contentHash}
        >
          {contentHash}
        </span>
      )}
    </div>
  );
}
