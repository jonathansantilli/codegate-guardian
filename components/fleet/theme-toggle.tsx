"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Ic } from "./icons";

/**
 * Light, dark, or whatever the machine says.
 *
 * The console follows the operating system by default, which is right most of
 * the time and wrong for anyone whose console sits on a wall display or who
 * simply prefers the other one. Three explicit states rather than a flip, so
 * "follow the system" stays reachable once you have left it.
 */

const ORDER = ["system", "light", "dark"] as const;

const LABEL: Record<(typeof ORDER)[number], { icon: string; text: string }> = {
  system: { icon: "system", text: "Theme: follows your system" },
  light: { icon: "sun", text: "Theme: light" },
  dark: { icon: "moon", text: "Theme: dark" },
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The server cannot know the operating system's preference, so rendering
  // the real icon before mount would flash the wrong one and warn about a
  // hydration mismatch.
  useEffect(() => setMounted(true), []);

  const current = ORDER.includes(theme as (typeof ORDER)[number])
    ? (theme as (typeof ORDER)[number])
    : "system";
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];

  return (
    <button
      aria-label={mounted ? LABEL[current].text : "Theme"}
      className="icon-btn"
      onClick={() => setTheme(next)}
      style={{ marginLeft: "auto" }}
      title={mounted ? `${LABEL[current].text} — click for ${next}` : "Theme"}
      type="button"
    >
      <Ic name={mounted ? LABEL[current].icon : "system"} size={15} />
    </button>
  );
}
