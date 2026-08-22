import { ActivityScreen } from "@/components/fleet/activity";
import { ExportButton } from "@/components/fleet/export-button";
import { FleetShell } from "@/components/fleet/fleet-shell";

export default function Page() {
  return (
    <FleetShell actions={<ExportButton kind="activity" />} title="Activity">
      <ActivityScreen />
    </FleetShell>
  );
}
