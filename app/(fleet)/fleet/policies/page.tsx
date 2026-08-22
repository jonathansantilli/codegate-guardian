import { FleetShell } from "@/components/fleet/fleet-shell";
import { PoliciesScreen } from "@/components/fleet/policies";

export default function Page() {
  return (
    <FleetShell title="Policies">
      <PoliciesScreen />
    </FleetShell>
  );
}
