import {
  ActivityIcon,
  ArrowRightIcon,
  BoxesIcon,
  DatabaseIcon,
  EyeOffIcon,
  FingerprintIcon,
  KeyRoundIcon,
  LaptopIcon,
  LockIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import "./home.css";

/**
 * The front page.
 *
 * Someone arriving at a self-hosted security console usually does not know
 * what it is, and the sign-in screen cannot tell them much — so this is where
 * "Back" from that screen leads. It states the product's central constraint
 * early and plainly, because a fleet console that never reaches a machine is
 * the surprising part, not a footnote.
 *
 * Static by construction: it reads nothing and renders the same bytes for
 * every visitor. Signed-in operators never see it — the proxy sends them
 * straight to the console.
 */

export const metadata: Metadata = {
  title: "CodeGate Guardian",
  description:
    "A self-hosted console for seeing what AI tooling your developers actually have installed, and which of it is dangerous.",
};

const SURFACES: {
  icon: typeof LaptopIcon;
  title: string;
  body: string;
}[] = [
  {
    icon: LaptopIcon,
    title: "Machines",
    body: "Every machine reporting in, who is accountable for it, what it carries, and when it last checked in.",
  },
  {
    icon: BoxesIcon,
    title: "Inventory",
    body: "Artifacts keyed by content hash, not by name. The same skill across forty machines is one row, and a tampered copy is a different one.",
  },
  {
    icon: TriangleAlertIcon,
    title: "Findings",
    body: "A lifecycle nobody has to maintain: open while a machine still reports it, resolved when a later report no longer does. Status is derived, never stored.",
  },
  {
    icon: ScrollTextIcon,
    title: "Policies",
    body: "Rules evaluated here against what each machine reported. Guardian flags a violation; it cannot block anything on a laptop.",
  },
  {
    icon: ActivityIcon,
    title: "Activity",
    body: "Who or what did something, and the API call behind it — including every check-in this server refused, and why.",
  },
  {
    icon: KeyRoundIcon,
    title: "API & access",
    body: "The console is a client of its own API. Anything you can do here, a script can do with a session.",
  },
];

const STEPS: { title: string; body: string }[] = [
  {
    title: "Deploy it",
    body: "Postgres and the console. Nothing else to run, and nothing to sign up for.",
  },
  {
    title: "Claim the instance",
    body: "The first operator registers with the setup token you generated. Registration then closes for good, so a networked instance cannot be claimed by whoever reaches the port first.",
  },
  {
    title: "Enrol a machine",
    body: "Mint an enrolment code in the console and run two commands on the machine. It is issued its own reporting token — check-ins are identified by that token, not by the machine id in the request.",
  },
  {
    title: "Read the fleet",
    body: "Every check-in writes a new report. Findings open when a machine reports them and resolve when it stops, so the next report is the evidence a fix landed.",
  },
];

const LIMITS: {
  icon: typeof LockIcon;
  title: string;
  body: string;
}[] = [
  {
    icon: EyeOffIcon,
    title: "It cannot block anything",
    body: "Guardian flags; the laptop keeps running. Enforcement belongs to the agent on the machine and the person who owns it — this server only ever describes what it was told.",
  },
  {
    icon: LockIcon,
    title: "One instance, one operator",
    body: "No roles, no user management, no way to add a second account. That is a deliberate limit rather than an oversight: a console that can add operators needs invitations, roles and an audit trail of who granted what, and none of that is built.",
  },
  {
    icon: DatabaseIcon,
    title: "It talks to Postgres, and nothing else",
    body: "No hosted database, no analytics, no error reporting, no external API. Fonts are vendored rather than fetched, so even the build reaches nothing but this repository.",
  },
];

function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-foreground text-background ${className}`}
    >
      <ShieldCheckIcon className="size-3.5" />
    </span>
  );
}

/**
 * The claim the whole product rests on, drawn rather than asserted: reports
 * travel one way. The absent return path is the point, so it is on the
 * diagram — struck through and unlabelled by an arrowhead it does not have.
 */
function ReportFlow() {
  const nodes = [
    { x: 1, label: "Developer machine", sub: "codegate agent" },
    { x: 282, label: "Guardian", sub: "this server" },
    { x: 563, label: "You", sub: "the console" },
  ];

  return (
    <figure className="flex flex-col gap-4">
      {/* Scaled to fit, it would render 13px labels at under 6px on a phone.
          Wide content scrolls in its own container instead. */}
      <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
        <svg
          aria-label="A developer machine sends reports to Guardian, which shows them to you. Nothing travels from Guardian back to the machine."
          className="h-auto w-full min-w-[600px] max-w-3xl text-foreground"
          role="img"
          viewBox="0 0 760 168"
        >
          <defs>
            <marker
              id="hm-arrow"
              markerHeight="8"
              markerUnits="userSpaceOnUse"
              markerWidth="8"
              orient="auto"
              refX="7"
              refY="4"
            >
              <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
            </marker>
          </defs>

          {nodes.map((node) => (
            <g key={node.label}>
              <rect
                fill="none"
                height="58"
                opacity="0.25"
                rx="10"
                stroke="currentColor"
                width="196"
                x={node.x}
                y="30"
              />
              <text
                fill="currentColor"
                fontSize="13"
                fontWeight="500"
                textAnchor="middle"
                x={node.x + 98}
                y="54"
              >
                {node.label}
              </text>
              <text
                fill="currentColor"
                fontSize="11"
                opacity="0.55"
                textAnchor="middle"
                x={node.x + 98}
                y="71"
              >
                {node.sub}
              </text>
            </g>
          ))}

          <line
            markerEnd="url(#hm-arrow)"
            opacity="0.55"
            stroke="currentColor"
            strokeWidth="1.5"
            x1="205"
            x2="272"
            y1="59"
            y2="59"
          />
          <text
            fill="currentColor"
            fontSize="11"
            opacity="0.55"
            textAnchor="middle"
            x="239"
            y="46"
          >
            reports
          </text>

          <line
            markerEnd="url(#hm-arrow)"
            opacity="0.55"
            stroke="currentColor"
            strokeWidth="1.5"
            x1="486"
            x2="553"
            y1="59"
            y2="59"
          />
          <text
            fill="currentColor"
            fontSize="11"
            opacity="0.55"
            textAnchor="middle"
            x="520"
            y="46"
          >
            shows
          </text>

          <path
            d="M380,88 L380,128 L99,128 L99,88"
            fill="none"
            opacity="0.3"
            stroke="currentColor"
            strokeDasharray="4 4"
            strokeWidth="1.5"
          />
          <line
            opacity="0.8"
            stroke="currentColor"
            strokeWidth="1.5"
            x1="233"
            x2="246"
            y1="122"
            y2="134"
          />
          <line
            opacity="0.8"
            stroke="currentColor"
            strokeWidth="1.5"
            x1="246"
            x2="233"
            y1="122"
            y2="134"
          />
          <text
            fill="currentColor"
            fontSize="11"
            opacity="0.55"
            textAnchor="middle"
            x="239"
            y="154"
          >
            this direction does not exist
          </text>
        </svg>
      </div>
      <figcaption className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
        Revoking an enrolment stops Guardian accepting a machine&rsquo;s
        reports. It does not reach the machine.
      </figcaption>
    </figure>
  );
}

export default function Page() {
  return (
    <div className="hm min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-border/60 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-6 px-6">
          <span className="flex items-center gap-2.5">
            <BrandMark />
            <span className="font-medium text-[15px] tracking-tight">
              Guardian
            </span>
          </span>
          <nav className="flex items-center gap-1">
            <Link
              className="hidden rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:block"
              href="#how"
            >
              How it works
            </Link>
            <Link
              className="hidden rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:block"
              href="#limits"
            >
              Limits
            </Link>
            <Button asChild size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6">
        <section className="fade-up flex flex-col gap-7 border-border/60 border-b py-20 md:py-28">
          <p className="hm-eyebrow text-muted-foreground">
            Self-hosted &middot; Report-only
          </p>
          <h1 className="max-w-3xl text-balance font-semibold text-4xl tracking-tight md:text-5xl">
            Know what AI tooling your developers actually have installed.
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground leading-relaxed">
            The <span className="font-mono text-[15px]">codegate</span> agent
            runs on each developer machine and inventories every skill, MCP
            server, rules file and config it finds. It scans them and reports
            what it saw. Guardian aggregates those reports and shows you which
            of it is dangerous.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button asChild size="lg">
              <Link href="/login">
                Sign in
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#how">How it works</Link>
            </Button>
          </div>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-4 text-[13px] text-muted-foreground">
            {[
              "Postgres, and nothing else",
              "No telemetry, no analytics, no external API",
              "MIT licensed",
            ].map((fact) => (
              <li className="flex items-center gap-2" key={fact}>
                <span className="size-[3px] rounded-full bg-muted-foreground/60" />
                {fact}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-8 border-border/60 border-b py-20">
          <div className="flex flex-col gap-4">
            <p className="hm-eyebrow text-muted-foreground">The constraint</p>
            <h2 className="max-w-2xl text-balance font-semibold text-3xl tracking-tight">
              This server never sends anything to a machine.
            </h2>
            <p className="max-w-2xl text-muted-foreground leading-relaxed">
              It receives, evaluates and displays. Remediation happens on the
              machine, by the person who owns it &mdash; and the next report is
              the evidence it happened. There is no channel in the other
              direction to misuse, and no credential on this server that would
              let anyone open one.
            </p>
          </div>
          <ReportFlow />
        </section>

        <section className="flex flex-col gap-8 border-border/60 border-b py-20">
          <div className="flex flex-col gap-4">
            <p className="hm-eyebrow flex items-center gap-2 text-muted-foreground">
              <FingerprintIcon className="size-3.5" />
              Identity
            </p>
            <h2 className="max-w-2xl text-balance font-semibold text-3xl tracking-tight">
              Identity is the content, not the name.
            </h2>
            <p className="max-w-2xl text-muted-foreground leading-relaxed">
              Every artifact is keyed by the hash of its bytes. Two files
              sharing a name but differing by one byte are two different
              artifacts here, so a malicious skill cannot hide behind a familiar
              filename.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                badge: "Known good",
                tone: "hm-ok",
                hash: "sha256:3f9a1c72e8b4d0517c6e",
                body: "Matches the copy published in the content bundle, byte for byte.",
              },
              {
                badge: "Critical",
                tone: "hm-crit",
                hash: "sha256:0b7d44af19c2e83a5f10",
                body: "Two lines longer than the original. The addition posts the working diff to an external endpoint.",
              },
            ].map((artifact) => (
              <div
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5"
                key={artifact.hash}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[13px]">code-review.md</span>
                  <span
                    className={`inline-flex h-5 items-center rounded-full px-2 font-medium text-xs ${artifact.tone}`}
                  >
                    {artifact.badge}
                  </span>
                </div>
                <span className="break-all font-mono text-[12px] text-muted-foreground">
                  {artifact.hash}
                  <span className="opacity-50">&hellip;</span>
                </span>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {artifact.body}
                </p>
              </div>
            ))}
          </div>

          <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
            Same filename. Two artifacts, listed separately, tracked separately.
            Guardian will never show you one while you are looking at the other.
          </p>
        </section>

        <section
          className="flex flex-col gap-8 border-border/60 border-b py-20"
          id="shows"
        >
          <div className="flex flex-col gap-4">
            <p className="hm-eyebrow text-muted-foreground">What it shows</p>
            <h2 className="max-w-2xl text-balance font-semibold text-3xl tracking-tight">
              Six surfaces, and the API behind every one of them.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SURFACES.map((surface) => (
              <div
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5"
                key={surface.title}
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
                  <surface.icon className="size-4" />
                </span>
                <h3 className="font-medium text-sm">{surface.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {surface.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          className="flex flex-col gap-10 border-border/60 border-b py-20"
          id="how"
        >
          <div className="flex flex-col gap-4">
            <p className="hm-eyebrow text-muted-foreground">How it works</p>
            <h2 className="max-w-2xl text-balance font-semibold text-3xl tracking-tight">
              From nothing to a reporting fleet.
            </h2>
          </div>

          <ol className="flex flex-col">
            {STEPS.map((step, index) => (
              <li
                className="flex gap-5 border-border/60 border-t py-6 first:border-t-0 first:pt-0"
                key={step.title}
              >
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted/60 font-mono text-[11px] text-muted-foreground ring-1 ring-border/50">
                  {index + 1}
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-medium text-sm">{step.title}</h3>
                  <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-5">
            <pre className="font-mono text-[12.5px] leading-relaxed">
              <code>
                <span className="text-muted-foreground">
                  # on the server{"\n"}
                </span>
                docker compose up --build{"\n"}
                {"\n"}
                <span className="text-muted-foreground">
                  # on each developer machine{"\n"}
                </span>
                npx codegate-ai enrol --server https://guardian.example.internal
                --code FLEET-XXXX-XXXX{"\n"}
                npx codegate-ai report
              </code>
            </pre>
          </div>
        </section>

        <section
          className="flex flex-col gap-8 border-border/60 border-b py-20"
          id="limits"
        >
          <div className="flex flex-col gap-4">
            <p className="hm-eyebrow text-muted-foreground">
              Deliberate limits
            </p>
            <h2 className="max-w-2xl text-balance font-semibold text-3xl tracking-tight">
              What it deliberately doesn&rsquo;t do.
            </h2>
            <p className="max-w-2xl text-muted-foreground leading-relaxed">
              Worth knowing before you deploy it, rather than after.
            </p>
          </div>
          <div className="flex flex-col rounded-lg border border-border bg-card">
            {LIMITS.map((limit) => (
              <div
                className="flex gap-4 border-border/60 border-t p-5 first:border-t-0"
                key={limit.title}
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
                  <limit.icon className="size-4" />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-medium text-sm">{limit.title}</h3>
                  <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
                    {limit.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col items-start gap-6 py-20">
          <h2 className="max-w-2xl text-balance font-semibold text-2xl tracking-tight">
            Already running an instance?
          </h2>
          <p className="max-w-2xl text-muted-foreground leading-relaxed">
            Sign in to the console. If nobody has claimed this one yet, sign-up
            will ask for the setup token from the environment it was deployed
            with &mdash; that token is what makes the first account yours.
          </p>
          <Button asChild size="lg">
            <Link href="/login">
              Sign in
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </section>
      </main>

      <footer className="border-border/60 border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <BrandMark className="opacity-90" />
            CodeGate Guardian
          </span>
          <span className="text-[13px] text-muted-foreground">
            MIT licensed &middot; Self-hosted &middot; Receives, evaluates,
            displays
          </span>
        </div>
      </footer>
    </div>
  );
}
