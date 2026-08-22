import { ArrowLeftIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";

/**
 * The sign-in frame.
 *
 * The panel beside the form says what this server is for, because someone
 * arriving at a self-hosted console often does not know: it receives reports
 * from machines and shows them, and it never sends anything back.
 */

const FACTS: { title: string; body: string }[] = [
  {
    title: "Machines report in",
    body: "CodeGate runs on each developer machine and reports the AI tooling installed there — every skill, config, MCP server and rules file.",
  },
  {
    title: "Identity is the content, not the name",
    body: "Two files sharing a name but differing by one byte are two artifacts here, so a malicious skill cannot hide behind a familiar filename.",
  },
  {
    title: "Nothing is sent back",
    body: "This server receives, evaluates and displays. Remediation happens on the machine, and the next report is the evidence it happened.",
  },
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh w-screen bg-sidebar">
      <div className="flex w-full flex-col bg-background p-8 xl:w-[600px] xl:shrink-0 xl:rounded-r-2xl xl:border-border/40 xl:border-r md:p-16">
        <Link
          className="flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          href="/"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back
        </Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-10">
          <div className="flex flex-col gap-2">
            <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
              <ShieldCheckIcon className="size-4" />
            </div>
            {children}
          </div>
        </div>
      </div>

      <div className="hidden flex-1 flex-col overflow-hidden pl-12 xl:flex">
        <div className="flex items-center gap-1.5 pt-8 text-[13px] text-muted-foreground/50">
          Powered by
          <ShieldCheckIcon className="size-3.5" />
          <span className="font-medium text-muted-foreground">CodeGate</span>
        </div>
        <div className="flex max-w-lg flex-1 flex-col justify-center gap-8 pr-12">
          <div className="flex flex-col gap-2">
            <h2 className="font-semibold text-2xl tracking-tight">Guardian</h2>
            <p className="text-muted-foreground text-sm">
              Fleet reporting for the AI tooling your developers actually have
              installed.
            </p>
          </div>
          <dl className="flex flex-col gap-6">
            {FACTS.map((fact) => (
              <div className="flex flex-col gap-1" key={fact.title}>
                <dt className="font-medium text-sm">{fact.title}</dt>
                <dd className="text-muted-foreground text-sm leading-relaxed">
                  {fact.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
