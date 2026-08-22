"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import { FileInspectScreen } from "@/components/fleet/file-inspect";
import { MachineShell } from "@/components/fleet/machine-shell";
import { Loading } from "@/components/fleet/ui";

export default function Page() {
  const hostId = String(useParams().id);

  return (
    <MachineShell hostId={hostId} leaf="Evidence">
      <Suspense fallback={<Loading label="Loading the evidence…" />}>
        <FileInspectScreen hostId={hostId} />
      </Suspense>
    </MachineShell>
  );
}
