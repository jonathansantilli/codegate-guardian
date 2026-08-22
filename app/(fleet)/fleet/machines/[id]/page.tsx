"use client";

import { useParams } from "next/navigation";
import { ExportButton } from "@/components/fleet/export-button";
import { MachineInventory } from "@/components/fleet/machine-detail";
import { MachineShell } from "@/components/fleet/machine-shell";

export default function Page() {
  const hostId = String(useParams().id);

  return (
    <MachineShell
      actions={
        <ExportButton
          hostId={hostId}
          kind="inventory"
          label="Export this machine"
        />
      }
      hostId={hostId}
    >
      <MachineInventory hostId={hostId} />
    </MachineShell>
  );
}
