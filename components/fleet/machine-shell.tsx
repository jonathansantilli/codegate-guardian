"use client";

import type { ReactNode } from "react";
import { FleetShell } from "./fleet-shell";
import { useHostDetail } from "./machine-detail";
import { RevokeButton } from "./revoke-button";

/**
 * The shell for anything scoped to one machine.
 *
 * The breadcrumb needs the hostname, which only the machine's own record
 * carries, so the shell waits for it rather than showing a raw id — an id in
 * the breadcrumb tells an operator nothing about whose laptop they are on.
 */
export function MachineShell({
  hostId,
  leaf,
  actions,
  children,
}: {
  hostId: string;
  /** A third crumb, for screens below the machine itself. */
  leaf?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { data } = useHostDetail(hostId);
  const hostname = data?.host.hostname ?? "Machine";

  const crumbs = leaf
    ? [
        { label: "Machines", href: "/fleet/machines" },
        { label: hostname, href: `/fleet/machines/${hostId}` },
      ]
    : [{ label: "Machines", href: "/fleet/machines" }];

  return (
    <FleetShell
      actions={
        <>
          {actions}
          {data && (
            <RevokeButton
              hostId={hostId}
              hostname={data.host.hostname}
              revokedAt={data.host.revokedAt}
            />
          )}
        </>
      }
      crumbs={crumbs}
      title={leaf ?? hostname}
    >
      {children}
    </FleetShell>
  );
}
