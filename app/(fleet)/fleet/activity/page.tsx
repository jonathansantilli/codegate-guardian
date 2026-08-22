import { ActivityScreen } from "@/components/fleet/activity";
import { FleetShell } from "@/components/fleet/fleet-shell";

export default function Page() {
  return (
    <FleetShell title="Activity">
      <ActivityScreen />
    </FleetShell>
  );
}
