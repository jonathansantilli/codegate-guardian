import { ExportButton } from "@/components/fleet/export-button";
import { FindingsScreen } from "@/components/fleet/findings";
import { FleetShell } from "@/components/fleet/fleet-shell";

export default function Page() {
  return (
    <FleetShell actions={<ExportButton kind="findings" />} title="Findings">
      <FindingsScreen />
    </FleetShell>
  );
}
