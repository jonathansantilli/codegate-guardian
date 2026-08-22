"use client";

import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { fetcher } from "@/lib/utils";

/**
 * The remaining console surfaces: policies, activity and access.
 *
 * Each states plainly what it does and does not do, because the whole product
 * rests on the reader believing the difference between reporting and enforcing.
 */

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Policy = {
  id: string;
  name: string;
  ruleId: string;
  severity: string;
  version: number;
  enabled: boolean;
  violatingMachines: number;
  evaluatedMachines: number;
};

type Activity = {
  id: string;
  occurredAt: string;
  actorKind: string;
  actorName: string;
  action: string;
  target: string | null;
  result: string;
  apiCall: string | null;
};

type EnrolmentCode = {
  id: string;
  code: string;
  label: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  usable: boolean;
};

type Suppression = {
  id: string;
  scope: string;
  ruleId: string | null;
  fingerprint: string | null;
  reason: string;
  createdBy: string;
  expiresAt: string | null;
  blastRadius: number;
};

function PanelHeading({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-border/50 border-b bg-muted/30 px-4 py-2.5">
      <h2 className="font-medium text-sm">{title}</h2>
      <span className="text-muted-foreground text-xs">{note}</span>
    </div>
  );
}

export function PoliciesPanel() {
  const { data } = useSWR<{ policies: Policy[] }>(
    `${base}/api/fleet/policies`,
    fetcher
  );
  const policies = data?.policies ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-border/50">
      <PanelHeading
        note="Evaluated here, against the latest report from each machine — never sent to one"
        title="Policies"
      />
      {policies.length === 0 && (
        <p className="px-4 py-6 text-center text-muted-foreground text-sm">
          No policies yet. A policy is a rule this server checks each report
          against; machines that break it show up as findings here.
        </p>
      )}
      <ul className="divide-y divide-border/40">
        {policies.map((policy) => (
          <li className="flex items-start gap-3 px-4 py-3" key={policy.id}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{policy.name}</span>
                <Badge className="font-normal text-xs" variant="secondary">
                  v{policy.version}
                </Badge>
                {!policy.enabled && (
                  <Badge className="font-normal text-xs" variant="outline">
                    Disabled
                  </Badge>
                )}
              </div>
              <span className="font-mono text-muted-foreground text-xs">
                {policy.ruleId} · reported as {policy.severity.toLowerCase()}
              </span>
            </div>
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {policy.violatingMachines} of {policy.evaluatedMachines} failing
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ActivityPanel() {
  const { data } = useSWR<{ activity: Activity[] }>(
    `${base}/api/fleet/activity`,
    fetcher,
    { refreshInterval: 30_000 }
  );
  const rows = data?.activity ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-border/50">
      <PanelHeading
        note="Everything done on this server. Nothing here changed a machine."
        title="Activity"
      />
      {rows.length === 0 && (
        <p className="px-4 py-6 text-center text-muted-foreground text-sm">
          No activity yet. The log starts with your first enrolment.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <tbody className="divide-y divide-border/40">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-2.5">
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{row.actorName}</span>
                    <span className="text-muted-foreground text-xs capitalize">
                      {row.actorKind}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-sm">{row.action}</td>
                <td className="max-w-[240px] truncate px-4 py-2.5 font-mono text-muted-foreground text-xs">
                  {row.target ?? "—"}
                </td>
                <td className="px-4 py-2.5">
                  <Badge className="font-normal text-xs" variant="secondary">
                    {row.result}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-muted-foreground text-xs">
                  {new Date(row.occurredAt)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")}{" "}
                  UTC
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AccessPanel() {
  const { data, mutate } = useSWR<{ codes: EnrolmentCode[] }>(
    `${base}/api/fleet/enrolment`,
    fetcher
  );
  const { data: suppressionData, mutate: mutateSuppressions } = useSWR<{
    suppressions: Suppression[];
  }>(`${base}/api/fleet/suppressions`, fetcher);

  const codes = data?.codes ?? [];
  const suppressions = suppressionData?.suppressions ?? [];

  async function mintCode() {
    await fetch(`${base}/api/fleet/enrolment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ maxUses: 1, expiresInHours: 24 }),
    });
    mutate();
  }

  async function revoke(id: string) {
    await fetch(`${base}/api/fleet/suppressions?id=${id}`, {
      method: "DELETE",
    });
    mutateSuppressions();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl border border-border/50">
        <div className="flex flex-wrap items-center gap-2.5 border-border/50 border-b bg-muted/30 px-4 py-2.5">
          <h2 className="font-medium text-sm">Enrolment codes</h2>
          <span className="text-muted-foreground text-xs">
            A capped, expiring code is how a whole cohort enrols through MDM
          </span>
          <button
            className="ml-auto h-7 rounded-lg bg-foreground px-3 font-medium text-background text-xs"
            onClick={mintCode}
            type="button"
          >
            Generate code
          </button>
        </div>
        {codes.length === 0 && (
          <p className="px-4 py-6 text-center text-muted-foreground text-sm">
            No codes yet. Generate one, then run{" "}
            <span className="font-mono">codegate enrol</span> on a machine.
          </p>
        )}
        <ul className="divide-y divide-border/40">
          {codes.map((code) => (
            <li className="flex items-center gap-3 px-4 py-2.5" key={code.id}>
              <span className="font-mono text-sm">{code.code}</span>
              <span className="text-muted-foreground text-xs">
                {code.label ?? "No label"}
              </span>
              <span className="ml-auto text-muted-foreground text-xs tabular-nums">
                {code.usedCount}/{code.maxUses} used
              </span>
              <Badge
                className="font-normal text-xs"
                variant={code.usable ? "secondary" : "outline"}
              >
                {code.usable ? "Usable" : "Spent or expired"}
              </Badge>
            </li>
          ))}
        </ul>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/50">
        <PanelHeading
          note="What is hidden from the findings queue, by whom and why"
          title="Suppressions"
        />
        {suppressions.length === 0 && (
          <p className="px-4 py-6 text-center text-muted-foreground text-sm">
            Nothing is suppressed. Every finding a machine reports is shown.
          </p>
        )}
        <ul className="divide-y divide-border/40">
          {suppressions.map((suppression) => (
            <li
              className="flex items-start gap-3 px-4 py-3"
              key={suppression.id}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">
                    {suppression.ruleId ?? suppression.fingerprint}
                  </span>
                  <Badge className="font-normal text-xs" variant="secondary">
                    {suppression.scope === "fleet"
                      ? "Fleet-wide"
                      : "One machine"}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  {suppression.reason} · {suppression.createdBy}
                  {suppression.expiresAt
                    ? ` · until ${new Date(suppression.expiresAt).toISOString().slice(0, 10)}`
                    : " · no expiry"}
                </p>
              </div>
              <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                hides {suppression.blastRadius}
              </span>
              <button
                className="h-7 shrink-0 rounded-lg border border-border px-2.5 font-medium text-xs"
                onClick={() => revoke(suppression.id)}
                type="button"
              >
                Un-suppress
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
