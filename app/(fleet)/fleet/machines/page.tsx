import Link from "next/link";
import { FleetShell } from "@/components/fleet/fleet-shell";
import { Ic } from "@/components/fleet/icons";
import { MachinesScreen } from "@/components/fleet/machines";

export default function Page() {
  return (
    <FleetShell
      actions={
        <Link className="btn sm btn-outline" href="/fleet/access">
          <Ic name="plus" size={14} /> Enrol machine
        </Link>
      }
      title="Machines"
    >
      <MachinesScreen />
    </FleetShell>
  );
}
