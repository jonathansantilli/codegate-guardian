"use client";

import { useParams } from "next/navigation";
import { ArtifactDetailScreen } from "@/components/fleet/artifact-detail";
import { FleetShell } from "@/components/fleet/fleet-shell";
import { hashFromSlug, shortHash } from "@/lib/security/artifact-presentation";

export default function Page() {
  const contentHash = hashFromSlug(String(useParams().hash));

  return (
    <FleetShell
      crumbs={[{ label: "Inventory", href: "/fleet/inventory" }]}
      title={shortHash(contentHash)}
    >
      <ArtifactDetailScreen contentHash={contentHash} />
    </FleetShell>
  );
}
