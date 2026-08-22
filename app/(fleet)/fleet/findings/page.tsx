import { FindingsScreen } from "@/components/fleet/findings";
import { FleetShell } from "@/components/fleet/fleet-shell";

export default function Page() {
  return (
    <FleetShell title="Findings">
      <FindingsScreen />
    </FleetShell>
  );
}
