"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
      <p className="text-muted-foreground text-sm">
        The agent reported no excerpt for this finding.
      </p>
    );
  }

  // The scanner formats its own excerpt, line numbers included. Rendering it
  // verbatim keeps the console honest about what was actually reported.
  const lines = evidence.split("\n");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {filePath && (
          <span className="break-all font-mono text-muted-foreground text-xs">
            {filePath}
          </span>
        )}
        {line !== null && (
          <Badge className="font-mono font-normal text-xs" variant="secondary">
            line {line}
            {column === null ? "" : `, col ${column}`}
          </Badge>
        )}
        {hiddenCount > 0 && (
          <button
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-md border px-2 font-medium text-xs",
              reveal
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground"
            )}
            onClick={() => setReveal(!reveal)}
            type="button"
          >
            Show hidden characters
            <span className="tabular-nums">({hiddenCount})</span>
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-muted/40">
        {lines.map((text, index) => (
          <div
            className="px-3 py-0.5 font-mono text-xs"
            // biome-ignore lint/suspicious/noArrayIndexKey: a line's position in the excerpt IS its identity; two identical lines are different lines.
            key={`line-${index}`}
          >
            <span className="whitespace-pre-wrap break-all">
              {reveal
                ? revealHidden(text).map((part, i) =>
                    part.hidden ? (
                      <span
                        className="mx-0.5 rounded bg-amber-500/20 px-1 py-px align-baseline text-[10px] text-amber-700 dark:text-amber-400"
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
        <span className="break-all font-mono text-muted-foreground text-xs">
          {contentHash}
        </span>
      )}
    </div>
  );
}
