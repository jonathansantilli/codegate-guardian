"use client";

import { useParams } from "next/navigation";
import { ExportButton } from "@/components/fleet/export-button";
import { MachineReport } from "@/components/fleet/machine-detail";
import { MachineShell } from "@/components/fleet/machine-shell";

export default function Page() {
  const hostId = String(useParams().id);

  return (
    <MachineShell
      actions={
        <ExportButton
          hostId={hostId}
          kind="findings"
          label="Export this machine"
        />
      }
      hostId={hostId}
      leaf="Report"
    >
      <MachineReport hostId={hostId} />
    </MachineShell>
  );
}
