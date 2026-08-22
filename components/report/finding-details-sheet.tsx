"use client";

import {
  AlertTriangleIcon,
  ExternalLinkIcon,
  FileCode2Icon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, fetcher } from "@/lib/utils";
import { buildGitHubSourceUrl } from "@/src/domain/reporting/services/github-source-link";

type FindingLocation = {
  filePath: string | null;
  field: string | null;
  line: number | null;
  column: number | null;
};

type FindingDetail = {
  id: string;
  findingId: string;
  scanRunId: string;
  chatId: string;
  createdAt: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  category: string | null;
  layer: string | null;
  ruleId: string | null;
  filePath: string | null;
  description: string;
  evidence: string | null;
  repositoryUrl: string | null;
  selectedSkill: string | null;
  scanMode: "repository" | "skills" | null;
  toolName: "analyzeConfig" | "scanGithubRepo";
  confidence: string | null;
  cwe: string | null;
  owasp: string[];
  fixable: boolean | null;
  primaryLocation: FindingLocation | null;
  affectedLocations: FindingLocation[];
  remediationActions: string[];
  affectedTools: string[];
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function humanizeToken(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function compactRepository(repositoryUrl: string | null) {
  if (!repositoryUrl) {
    return "Config Scan";
  }

  try {
    const url = new URL(repositoryUrl);
    return url.pathname.replace(/^\/+/g, "") || repositoryUrl;
  } catch {
    return repositoryUrl;
  }
}

function formatLocation(location: FindingLocation | null) {
  if (!location) {
    return "Not available";
  }

  const parts = [
    location.filePath,
    location.line === null ? null : `line ${location.line}`,
    location.column === null ? null : `column ${location.column}`,
    location.field ? `field ${location.field}` : null,
  ].filter(Boolean);

  if (parts.length === 0) {
    return "Not available";
  }

  return parts.join(" • ");
}

function severityClasses(severity: FindingDetail["severity"]) {
  if (severity === "CRITICAL") {
    return "border-red-500/50 bg-red-500/10 text-red-200";
  }
  if (severity === "HIGH") {
    return "border-orange-500/50 bg-orange-500/10 text-orange-200";
  }
  if (severity === "MEDIUM") {
    return "border-amber-500/50 bg-amber-500/10 text-amber-200";
  }
  if (severity === "LOW") {
    return "border-sky-500/50 bg-sky-500/10 text-sky-200";
  }
  return "border-slate-500/50 bg-slate-500/10 text-slate-200";
}

function formatToolName(toolName: FindingDetail["toolName"]) {
  if (toolName === "scanGithubRepo") {
    return "GitHub Repo Scan";
  }
  return "Config Analysis";
}

function LoadingState() {
  return (
    <div className="space-y-4 p-5">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-card p-2">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

export function FindingDetailsSheet({
  findingId,
  onClose,
}: {
  findingId: string | null;
  onClose: () => void;
}) {
  const isOpen = Boolean(findingId);
  const { data, error, isLoading } = useSWR<FindingDetail>(
    findingId
      ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/report/finding?id=${findingId}`
      : null,
    fetcher
  );

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={isOpen}
    >
      <SheetContent
        className="w-[96vw] p-0 data-[side=right]:sm:max-w-2xl"
        showCloseButton={false}
        side="right"
      >
        <Button
          className="absolute top-4 right-4 z-10"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon />
          <span className="sr-only">Close</span>
        </Button>
        <SheetHeader className="pb-4">
          <SheetTitle>Finding Details</SheetTitle>
          <SheetDescription>
            Security finding metadata, source context, and remediation guidance.
          </SheetDescription>
        </SheetHeader>
        <Separator />

        <ScrollArea className="min-h-0 flex-1">
          {isLoading ? (
            <LoadingState />
          ) : error || !data ? (
            <div className="p-5">
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-200 text-sm">
                Failed to load finding details.
              </div>
            </div>
          ) : (
            <div className="space-y-5 p-5 pb-8">
              {(() => {
                const sourceFilePath =
                  data.primaryLocation?.filePath ?? data.filePath;
                const sourceLine = data.primaryLocation?.line ?? null;
                const sourceFileUrl = buildGitHubSourceUrl({
                  repositoryUrl: data.repositoryUrl,
                  filePath: sourceFilePath,
                  line: null,
                });
                const sourceLineUrl = buildGitHubSourceUrl({
                  repositoryUrl: data.repositoryUrl,
                  filePath: sourceFilePath,
                  line: sourceLine,
                });

                return sourceFileUrl ? (
                  <div className="rounded-lg border border-border/60 bg-card p-3">
                    <p className="font-medium text-sm">Source</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a
                        className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1.5 text-sm transition-colors hover:bg-muted/40"
                        href={sourceFileUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open file
                        <ExternalLinkIcon className="size-3.5" />
                      </a>
                      {sourceLine !== null &&
                        sourceLineUrl &&
                        sourceLineUrl !== sourceFileUrl && (
                          <a
                            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1.5 text-sm transition-colors hover:bg-muted/40"
                            href={sourceLineUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Open at line {sourceLine}
                            <ExternalLinkIcon className="size-3.5" />
                          </a>
                        )}
                    </div>
                  </div>
                ) : null;
              })()}

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={cn(
                      "rounded-full",
                      severityClasses(data.severity)
                    )}
                  >
                    {humanizeToken(data.severity)}
                  </Badge>
                  {data.category && (
                    <Badge variant="outline">
                      {humanizeToken(data.category)}
                    </Badge>
                  )}
                  {data.layer && (
                    <Badge variant="outline">{data.layer.toUpperCase()}</Badge>
                  )}
                  {data.selectedSkill && (
                    <Badge className="font-mono text-[11px]" variant="outline">
                      Skill: {data.selectedSkill}
                    </Badge>
                  )}
                </div>

                <p className="text-sm leading-6">{data.description}</p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <MetadataRow
                  label="Repository"
                  value={compactRepository(data.repositoryUrl)}
                />
                <MetadataRow
                  label="Detected At"
                  value={formatTimestamp(data.createdAt)}
                />
                <MetadataRow
                  label="File / Location"
                  value={formatLocation(data.primaryLocation)}
                />
                <MetadataRow
                  label="Scan Mode"
                  value={data.scanMode ?? "Unknown"}
                />
                <MetadataRow
                  label="Tool"
                  value={formatToolName(data.toolName)}
                />
                <MetadataRow
                  label="Rule Id"
                  value={data.ruleId ?? "Not provided"}
                />
                <MetadataRow label="CWE" value={data.cwe ?? "Not provided"} />
                <MetadataRow
                  label="Confidence"
                  value={data.confidence ?? "Not provided"}
                />
                <MetadataRow
                  label="Fixable"
                  value={
                    data.fixable === null
                      ? "Unknown"
                      : data.fixable
                        ? "Yes"
                        : "No"
                  }
                />
              </div>

              {data.owasp.length > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                    OWASP
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {data.owasp.map((tag) => (
                      <Badge
                        className="rounded-full"
                        key={tag}
                        variant="outline"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-border/60 bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">Evidence</p>
                  <Link
                    className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
                    href={`/chat/${data.chatId}`}
                  >
                    Open source chat
                    <ExternalLinkIcon className="size-3.5" />
                  </Link>
                </div>
                <p className="rounded-md bg-black/20 px-2.5 py-2 font-mono text-[11px] text-muted-foreground leading-relaxed break-words whitespace-pre-wrap">
                  {data.evidence?.trim() || "No explicit evidence provided."}
                </p>
              </div>

              {data.remediationActions.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-card p-3">
                  <p className="font-medium text-sm">Remediation Actions</p>
                  <ul className="mt-2 space-y-2 text-sm">
                    {data.remediationActions.map((action) => (
                      <li
                        className="rounded-md border border-border/50 bg-muted/20 px-2 py-1.5 leading-6"
                        key={action}
                      >
                        {action}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(data.affectedLocations.length > 0 ||
                data.affectedTools.length > 0) && (
                <div className="rounded-lg border border-border/60 bg-card p-3">
                  <p className="font-medium text-sm">Additional Impact</p>
                  <div className="mt-2 space-y-2">
                    {data.affectedLocations.length > 0 && (
                      <div>
                        <p className="text-muted-foreground text-xs uppercase tracking-wide">
                          Affected locations
                        </p>
                        <div className="mt-1.5 max-h-32 space-y-1 overflow-auto pr-1">
                          {data.affectedLocations.map((location, index) => (
                            <p
                              className="rounded bg-black/20 px-2 py-1 font-mono text-[11px] text-muted-foreground leading-relaxed break-words"
                              // biome-ignore lint/suspicious/noArrayIndexKey: static read-only list; identical locations can repeat, so the index disambiguates.
                              key={`${location.filePath ?? "unknown"}-${index}`}
                            >
                              {formatLocation(location)}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {data.affectedTools.length > 0 && (
                      <div>
                        <p className="text-muted-foreground text-xs uppercase tracking-wide">
                          Affected tools
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {data.affectedTools.map((tool) => (
                            <Badge
                              className="rounded-full"
                              key={tool}
                              variant="outline"
                            >
                              {tool}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  Finding identity
                </p>
                <div className="space-y-1 text-muted-foreground text-xs">
                  <p className="flex items-center gap-2 break-all font-mono">
                    <AlertTriangleIcon className="size-3.5 shrink-0" />
                    finding.id: {data.id}
                  </p>
                  <p className="flex items-center gap-2 break-all font-mono">
                    <FileCode2Icon className="size-3.5 shrink-0" />
                    finding.key: {data.findingId}
                  </p>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
