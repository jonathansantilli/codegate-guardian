import { AccessScreen } from "@/components/fleet/access";
import { FleetShell } from "@/components/fleet/fleet-shell";

export default function Page() {
  return (
    <FleetShell title="API & access">
      <AccessScreen />
    </FleetShell>
  );
}
