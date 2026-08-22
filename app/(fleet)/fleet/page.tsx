import { FleetSearch } from "@/components/fleet/fleet-search";
import { FleetShell } from "@/components/fleet/fleet-shell";
import { OverviewScreen } from "@/components/fleet/overview";

export default function Page() {
  return (
    <FleetShell actions={<FleetSearch />} title="Overview">
      <OverviewScreen />
    </FleetShell>
  );
}
