import { FleetShell } from "@/components/fleet/fleet-shell";
import { InventoryScreen } from "@/components/fleet/inventory";

export default function Page() {
  return (
    <FleetShell title="Inventory">
      <InventoryScreen />
    </FleetShell>
  );
}
