import type { ReactNode } from "react";

/**
 * The console's icon set, taken from the design canvas so the two cannot
 * drift. Every glyph is drawn on a 24px grid with a 1.75 stroke; `Ic` is the
 * only thing that renders one.
 */

export const ICONS: Record<string, ReactNode> = {
  overview: (
    <>
      <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />
    </>
  ),
  machines: (
    <>
      <rect height="7" rx="1.5" width="18" x="3" y="4" />
      <rect height="7" rx="1.5" width="18" x="3" y="13" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </>
  ),
  inventory: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </>
  ),
  findings: (
    <>
      <path d="M12 4l9 15H3z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  policies: (
    <>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  activity: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  api: (
    <>
      <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L20 20" />
    </>
  ),
  chevron: (
    <>
      <path d="M9 5l7 7-7 7" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  filter: (
    <>
      <path d="M4 5h16l-6 7v6l-4 2v-8z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  bolt: (
    <>
      <path d="M13 3L5 13h6l-1 8 8-10h-6z" />
    </>
  ),
  copy: (
    <>
      <rect height="11" rx="2" width="11" x="9" y="9" />
      <path d="M5 15V5a2 2 0 012-2h8" />
    </>
  ),
  ext: (
    <>
      <path d="M14 4h6v6M20 4l-8 8M18 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4" />
    </>
  ),
  check: (
    <>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </>
  ),
  x: (
    <>
      <path d="M6 6l12 12M18 6L6 18" />
    </>
  ),
  down: (
    <>
      <path d="M6 9l6 6 6-6" />
    </>
  ),
  shieldOff: (
    <>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9.5 9.5l5 5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 11-2.5-5.8" />
      <path d="M20 4v5h-5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>
  ),
  robot: (
    <>
      <rect height="11" rx="3" width="16" x="4" y="8" />
      <path d="M12 4v4M9 13h.01M15 13h.01" />
    </>
  ),
  server: (
    <>
      <rect height="6" rx="1.5" width="16" x="4" y="4" />
      <rect height="6" rx="1.5" width="16" x="4" y="14" />
    </>
  ),
};

export type IconName = keyof typeof ICONS;

export function Ic({
  name,
  size = 16,
  sw = 1.75,
}: {
  name: string;
  size?: number;
  sw?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={sw}
      viewBox="0 0 24 24"
      width={size}
    >
      {ICONS[name]}
    </svg>
  );
}
