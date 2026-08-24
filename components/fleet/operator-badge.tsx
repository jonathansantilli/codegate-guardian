"use client";

import { signOut, useSession } from "next-auth/react";
import { Ic } from "./icons";
import { ThemeToggle } from "./theme-toggle";

/**
 * Who is signed in, and the way out.
 *
 * The rail footer said "Operator / Signed in" for everyone, and there was no
 * way to sign out at all — which on a console that records who acknowledged
 * and who suppressed is worse than untidy: the name on those records is
 * whoever last used the browser.
 */

/** "jonathan@acme.com" → JO. Never more than two. */
function initials(email: string): string {
  const name = email.split("@")[0];
  const parts = name.split(/[.\-_+]/).filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

export function OperatorBadge() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;

  return (
    <div className="side-f">
      <div className="avatar">{email ? initials(email) : "··"}</div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          lineHeight: 1.2,
          minWidth: 0,
          flex: 1,
        }}
      >
        <span
          className="trunc"
          style={{ fontSize: "12.5px", fontWeight: 500 }}
          title={email ?? undefined}
        >
          {email ?? "Signed in"}
        </span>
        <span style={{ fontSize: "11px", color: "var(--fg3)" }}>Operator</span>
      </div>
      <ThemeToggle />
      <button
        aria-label="Sign out"
        className="icon-btn"
        onClick={() => signOut({ redirectTo: "/login" })}
        title="Sign out"
        type="button"
      >
        <Ic name="signOut" size={15} />
      </button>
    </div>
  );
}
