import {
  ActivityIcon,
  ArrowRightIcon,
  BoxesIcon,
  DatabaseIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LaptopIcon,
  LockIcon,
  ScrollTextIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { GuardianMark } from "@/components/guardian-mark";
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

const DESCRIPTION =
  "A self-hosted console for seeing what AI tooling your developers actually have installed, and which of it is dangerous.";

export const metadata: Metadata = {
  title: "CodeGate Guardian",
  description: DESCRIPTION,
  openGraph: {
    title: "CodeGate Guardian",
    description: DESCRIPTION,
    type: "website",
  },
};

const SURFACES: { icon: typeof LaptopIcon; title: string; body: string }[] = [
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
    body: "The first operator registers with the setup token you generated, so a networked instance cannot be claimed by whoever reaches the port first.",
  },
  {
    title: "Enrol a machine",
    body: "Mint a code, run two commands. The machine is issued its own reporting token — check-ins are identified by that token, not by the id in the request.",
  },
  {
    title: "Read the fleet",
    body: "Every check-in writes a report. Findings open when a machine reports them and resolve when it stops, so the next report is the evidence a fix landed.",
  },
];

const LIMITS: { icon: typeof LockIcon; title: string; body: string }[] = [
  {
    icon: EyeOffIcon,
    title: "It cannot block anything",
    body: "Guardian flags; the laptop keeps running. Enforcement belongs to the agent on the machine and the person who owns it — this server only ever describes what it was told.",
  },
  {
    icon: LockIcon,
    title: "One instance, one operator",
    body: "No roles, no user management, no second account. A deliberate limit rather than an oversight: a console that can add operators needs invitations, roles and an audit trail of who granted what, and none of that is built.",
  },
  {
    icon: DatabaseIcon,
    title: "It talks to Postgres, and nothing else",
    body: "No hosted database, no analytics, no error reporting, no external API. Fonts are vendored rather than fetched, so even the build reaches nothing but this repository.",
  },
];

/** Illustrative, not real data — hence aria-hidden. */
const INVENTORY_ROWS: {
  name: string;
  hash: string;
  note: string;
  critical?: boolean;
}[] = [
  { name: "skills/pr-review.md", hash: "3f9a1c72e8b4", note: "38 machines" },
  { name: "mcp/filesystem.json", hash: "c41e0a99b7d3", note: "40 machines" },
  {
    name: "skills/deploy-helper.md",
    hash: "0b7d44af19c2",
    note: "Critical",
    critical: true,
  },
  { name: "rules/commit-style.md", hash: "7ae2f018c95d", note: "12 machines" },
  { name: "mcp/github.json", hash: "1d6b83ca420f", note: "31 machines" },
];

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <GuardianMark className="size-6 shrink-0" />
      <span className="font-medium text-[15px] tracking-tight">
        <span className="text-muted-foreground">CodeGate</span> Guardian
      </span>
    </span>
  );
}

/**
 * The hero's right-hand side: the console's own subject matter, at a glance.
 * The point it makes is the page's thesis — a long quiet list with one thing
 * in it that is not quiet, which is the only place colour appears up here.
 */
function InventoryPanel() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-float)]"
    >
      <div className="flex items-center justify-between gap-3 border-border/60 border-b bg-muted/30 px-4 py-3">
        <span className="flex items-center gap-2">
          <GuardianMark className="size-4" />
          <span className="font-medium text-[13px]">Inventory</span>
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          42 machines
        </span>
      </div>
      <div className="flex flex-col divide-y divide-border/60">
        {INVENTORY_ROWS.map((row) => (
          <div
            className="flex items-center justify-between gap-4 px-4 py-3"
            key={row.hash}
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate font-mono text-[12.5px]">
                {row.name}
              </span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                sha256:{row.hash}
                <span className="opacity-50">&hellip;</span>
              </span>
            </span>
            {row.critical ? (
              <span className="hm-crit inline-flex h-5 shrink-0 items-center rounded-full px-2 font-medium text-[11px]">
                {row.note}
              </span>
            ) : (
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {row.note}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-border/60 border-t bg-muted/30 px-4 py-3 font-mono text-[11px] text-muted-foreground">
        <span>1,284 artifacts</span>
        <span>1 finding open</span>
      </div>
    </div>
  );
}

/**
 * The claim the whole product rests on, drawn rather than asserted.
 *
 * The return path is the point of the picture, so it is drawn as a real
 * arrow — direction legible — and then stopped, rather than left as an
 * ambiguous dotted line the eye reads as decoration.
 */
function ReportFlow() {
  const nodes = [
    { x: 30, label: "Developer machine", sub: "codegate agent" },
    { x: 445, label: "Guardian", sub: "this server" },
    { x: 860, label: "You", sub: "the console" },
  ];

  return (
    <figure className="flex flex-col gap-6">
      {/* Scaled to fit a phone it would render its labels at a few pixels.
          Wide content scrolls in its own container instead. */}
      <div className="-mx-6 overflow-x-auto px-6 md:mx-0 md:px-0">
        <svg
          aria-label="A developer machine sends reports to Guardian, which shows them to you. The return path from Guardian to the machine is drawn blocked: it does not exist."
          className="h-auto w-full min-w-[880px] text-foreground"
          role="img"
          viewBox="0 0 1200 300"
        >
          <defs>
            <marker
              id="hm-arrow"
              markerHeight="10"
              markerUnits="userSpaceOnUse"
              markerWidth="10"
              orient="auto"
              refX="8"
              refY="5"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="var(--muted-foreground)" />
            </marker>
            <marker
              id="hm-arrow-back"
              markerHeight="13"
              markerUnits="userSpaceOnUse"
              markerWidth="13"
              orient="auto"
              refX="11"
              refY="6.5"
            >
              <path d="M0,0 L13,6.5 L0,13 z" fill="var(--muted-foreground)" />
            </marker>
          </defs>

          {nodes.map((node) => (
            <g key={node.label}>
              <rect
                fill="var(--card)"
                height="92"
                rx="12"
                stroke="var(--border)"
                width="310"
                x={node.x}
                y="48"
              />
              <text
                fill="currentColor"
                fontSize="18"
                fontWeight="500"
                textAnchor="middle"
                x={node.x + 155}
                y="88"
              >
                {node.label}
              </text>
              <text
                fill="var(--muted-foreground)"
                fontSize="13"
                textAnchor="middle"
                x={node.x + 155}
                y="110"
              >
                {node.sub}
              </text>
            </g>
          ))}

          <line
            markerEnd="url(#hm-arrow)"
            stroke="var(--muted-foreground)"
            strokeWidth="2"
            x1="352"
            x2="431"
            y1="94"
            y2="94"
          />
          <text
            fill="var(--muted-foreground)"
            fontSize="14"
            textAnchor="middle"
            x="392"
            y="78"
          >
            reports
          </text>

          <line
            markerEnd="url(#hm-arrow)"
            stroke="var(--muted-foreground)"
            strokeWidth="2"
            x1="767"
            x2="846"
            y1="94"
            y2="94"
          />
          <text
            fill="var(--muted-foreground)"
            fontSize="14"
            textAnchor="middle"
            x="807"
            y="78"
          >
            shows
          </text>

          {/* The absent channel. The arrowhead is what makes the direction
              readable — without it the eye reads a dotted line as decoration.
              The prohibition mark is what makes the direction false. */}
          <path
            d="M600 140 V220 H185 V158"
            fill="none"
            markerEnd="url(#hm-arrow-back)"
            opacity="0.8"
            stroke="var(--muted-foreground)"
            strokeDasharray="7 6"
            strokeWidth="2"
          />
          <circle
            cx="392"
            cy="220"
            fill="var(--background)"
            r="15"
            stroke="var(--crit)"
            strokeWidth="2.5"
          />
          <line
            stroke="var(--crit)"
            strokeLinecap="round"
            strokeWidth="2.5"
            x1="382"
            x2="402"
            y1="230"
            y2="210"
          />
          <text
            fill="var(--crit)"
            fontSize="14"
            fontWeight="500"
            textAnchor="middle"
            x="392"
            y="266"
          >
            no commands, no configuration, no reach
          </text>
        </svg>
      </div>
      <figcaption className="max-w-2xl text-muted-foreground leading-relaxed">
        Revoking an enrolment stops Guardian accepting a machine&rsquo;s
        reports. It does not reach the machine.
      </figcaption>
    </figure>
  );
}

export default function Page() {
  return (
    <div className="hm flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 border-border/60 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-6 px-6 md:px-8">
          <Wordmark />
          <nav className="flex items-center gap-1">
            {[
              { href: "#how", label: "How it works" },
              { href: "#shows", label: "What it shows" },
              { href: "#limits", label: "Limits" },
            ].map((item) => (
              <Link
                className="hidden rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground md:block"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
            <Button asChild className="ml-2" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 md:px-8">
        <section className="fade-up grid items-center gap-14 border-border/60 border-b py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
          <div className="flex flex-col gap-7">
            <p className="hm-eyebrow text-muted-foreground">
              Self-hosted &middot; Report-only
            </p>
            <h1 className="text-balance font-semibold text-4xl tracking-tight md:text-5xl">
              Know what AI tooling your developers actually have installed.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground leading-relaxed">
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
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-3 text-[13px] text-muted-foreground">
              {[
                "Postgres, and nothing else",
                "No telemetry, no external API",
                "MIT licensed",
              ].map((fact) => (
                <li className="flex items-center gap-2" key={fact}>
                  <span className="size-[3px] rounded-full bg-muted-foreground/60" />
                  {fact}
                </li>
              ))}
            </ul>
          </div>
          <div className="hidden md:block">
            <InventoryPanel />
          </div>
        </section>

        <section className="flex flex-col gap-10 border-border/60 border-b py-20 lg:py-24">
          <div className="flex flex-col gap-4">
            <p className="hm-eyebrow text-muted-foreground">The constraint</p>
            <h2 className="max-w-3xl text-balance font-semibold text-3xl tracking-tight md:text-4xl">
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

        <section
          className="flex flex-col gap-10 border-border/60 border-b py-20 lg:py-24"
          id="identity"
        >
          <div className="flex flex-col gap-4">
            <p className="hm-eyebrow text-muted-foreground">Identity</p>
            <h2 className="max-w-3xl text-balance font-semibold text-3xl tracking-tight md:text-4xl">
              Identity is the content, not the name.
            </h2>
            <p className="max-w-2xl text-muted-foreground leading-relaxed">
              Every artifact is keyed by the hash of its bytes. Two files
              sharing a name but differing by one byte are two different
              artifacts here, so a malicious skill cannot hide behind a familiar
              filename.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
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
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6"
                key={artifact.hash}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm">code-review.md</span>
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

          <p className="max-w-2xl text-muted-foreground leading-relaxed">
            Same filename. Two artifacts, listed separately, tracked separately.
            Guardian will never show you one while you are looking at the other.
          </p>
        </section>

        <section
          className="flex flex-col gap-10 border-border/60 border-b py-20 lg:py-24"
          id="shows"
        >
          <div className="flex flex-col gap-4">
            <p className="hm-eyebrow text-muted-foreground">What it shows</p>
            <h2 className="max-w-3xl text-balance font-semibold text-3xl tracking-tight md:text-4xl">
              Six surfaces, and the API behind every one of them.
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SURFACES.map((surface) => (
              <div
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6"
                key={surface.title}
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
                  <surface.icon className="size-4" />
                </span>
                <h3 className="font-medium">{surface.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {surface.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          className="flex flex-col gap-10 border-border/60 border-b py-20 lg:py-24"
          id="how"
        >
          <div className="flex flex-col gap-4">
            <p className="hm-eyebrow text-muted-foreground">How it works</p>
            <h2 className="max-w-3xl text-balance font-semibold text-3xl tracking-tight md:text-4xl">
              From nothing to a reporting fleet.
            </h2>
          </div>

          <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li
                className="flex flex-col gap-3 border-border/60 border-t pt-5"
                key={step.title}
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-muted/60 font-mono text-[12px] text-muted-foreground ring-1 ring-border/50">
                  {index + 1}
                </span>
                <h3 className="font-medium">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>

          <div className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-6">
            <pre className="font-mono text-[13px] leading-relaxed">
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
          className="flex flex-col gap-10 border-border/60 border-b py-20 lg:py-24"
          id="limits"
        >
          <div className="flex flex-col gap-4">
            <p className="hm-eyebrow text-muted-foreground">
              Deliberate limits
            </p>
            <h2 className="max-w-3xl text-balance font-semibold text-3xl tracking-tight md:text-4xl">
              What it deliberately doesn&rsquo;t do.
            </h2>
            <p className="max-w-2xl text-muted-foreground leading-relaxed">
              Worth knowing before you deploy it, rather than after.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {LIMITS.map((limit) => (
              <div
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6"
                key={limit.title}
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
                  <limit.icon className="size-4" />
                </span>
                <h3 className="font-medium">{limit.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {limit.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-16 lg:py-20">
          <div className="flex flex-col items-start gap-6 rounded-xl border border-border bg-card p-8 md:flex-row md:items-center md:justify-between md:p-10">
            <div className="flex max-w-xl flex-col gap-2">
              <h2 className="text-balance font-semibold text-2xl tracking-tight">
                Already running an instance?
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Sign in to the console. If nobody has claimed this one yet,
                sign-up will ask for the setup token from the environment it was
                deployed with &mdash; that token is what makes the first account
                yours.
              </p>
            </div>
            <Button asChild className="shrink-0" size="lg">
              <Link href="/login">
                Sign in
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-border/60 border-t bg-muted/20">
        <div className="mx-auto w-full max-w-7xl px-6 py-14 md:px-8">
          <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
            <div className="flex flex-col gap-4">
              <Wordmark />
              <p className="max-w-xs text-muted-foreground text-sm leading-relaxed">
                {DESCRIPTION}
              </p>
            </div>

            {[
              {
                heading: "On this page",
                links: [
                  { href: "#identity", label: "Identity" },
                  { href: "#shows", label: "What it shows" },
                  { href: "#how", label: "How it works" },
                  { href: "#limits", label: "Deliberate limits" },
                ],
              },
              {
                heading: "Console",
                links: [
                  { href: "/login", label: "Sign in" },
                  { href: "/register", label: "Claim an instance" },
                ],
              },
            ].map((column) => (
              <div className="flex flex-col gap-4" key={column.heading}>
                <h2 className="hm-eyebrow text-muted-foreground">
                  {column.heading}
                </h2>
                <ul className="flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
                        href={link.href}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="flex flex-col gap-4">
              <h2 className="hm-eyebrow text-muted-foreground">This build</h2>
              <ul className="flex flex-col gap-2.5 text-muted-foreground text-sm">
                <li>MIT licensed</li>
                <li>Self-hosted</li>
                <li>No telemetry</li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col gap-2 border-border/60 border-t pt-6 text-muted-foreground text-xs sm:flex-row sm:items-center sm:justify-between">
            <span>CodeGate Guardian</span>
            <span>Receives, evaluates, displays. Never sends.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
