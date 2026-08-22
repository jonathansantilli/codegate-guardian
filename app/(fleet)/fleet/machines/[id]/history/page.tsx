"use client";

import { useParams } from "next/navigation";
import { MachineHistory } from "@/components/fleet/machine-detail";
import { MachineShell } from "@/components/fleet/machine-shell";

export default function Page() {
  const hostId = String(useParams().id);

  return (
    <MachineShell hostId={hostId} leaf="History">
      <MachineHistory hostId={hostId} />
    </MachineShell>
  );
}
