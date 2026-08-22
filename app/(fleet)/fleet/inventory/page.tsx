import { ExportButton } from "@/components/fleet/export-button";
import { FleetShell } from "@/components/fleet/fleet-shell";
import { InventoryScreen } from "@/components/fleet/inventory";

export default function Page() {
  return (
    <FleetShell actions={<ExportButton kind="inventory" />} title="Inventory">
      <InventoryScreen />
    </FleetShell>
  );
}
