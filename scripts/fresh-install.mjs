#!/usr/bin/env node
/**
 * Puts a local stack back to the state a brand-new operator meets.
 *
 * Testing first-run is otherwise awkward: once you have registered, the
 * console is claimed forever and the sign-up form stops asking for the setup
 * token — so the one path you most want to check is the one you can no longer
 * reach. This drops the database and everything in it, and nothing else.
 *
 *   pnpm fresh
 *
 * It refuses to touch anything that is not obviously a local stack, and it
 * refuses when it cannot tell.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DATABASE = process.env.POSTGRES_DB ?? "postgres";

function docker(args, options = {}) {
  return execFileSync("docker", args, { encoding: "utf8", ...options }).trim();
}

/**
 * Finds this checkout's Postgres container.
 *
 * Asked of compose rather than assumed from a fixed name: the containers are
 * namespaced by project, so a second checkout gets different names, and
 * guessing would either miss it or — worse — find the other one and drop the
 * wrong database. POSTGRES_CONTAINER overrides for anything unusual.
 */
function resolveContainer() {
  if (process.env.POSTGRES_CONTAINER) {
    return process.env.POSTGRES_CONTAINER;
  }
  // Asked of Docker by the labels compose stamps, not of `docker compose ps`:
  // that command interpolates every service's variables, including the app's
  // required AUTH_SECRET, so it fails here for a reason that has nothing to
  // do with finding a container. The working directory is what makes this
  // precise — it is this checkout's Postgres, not another copy's.
  try {
    const id = docker([
      "ps",
      "--quiet",
      "--filter",
      `label=com.docker.compose.project.working_dir=${process.cwd()}`,
      "--filter",
      "label=com.docker.compose.service=postgres",
    ])
      .split("\n")[0]
      .trim();
    if (id) {
      return id;
    }
  } catch {
    // Docker unavailable; fall through to the error below
  }
  return null;
}

const CONTAINER = resolveContainer();

/** The container's name, for messages: an id tells the reader nothing. */
function containerLabel(id) {
  try {
    return docker(["inspect", "--format", "{{.Name}}", id]).replace(/^\//, "");
  } catch {
    return id;
  }
}

if (!CONTAINER) {
  console.error(
    "No running Postgres for this checkout. Start the stack first:\n" +
      "  docker compose up -d postgres"
  );
  process.exit(1);
}

function psql(sql, database = DATABASE) {
  return docker([
    "exec",
    CONTAINER,
    "psql",
    "-U",
    "postgres",
    "-d",
    database,
    "-t",
    "-c",
    sql,
  ]);
}

// A published port on localhost is the marker of a dev stack. Refusing
// otherwise is the difference between a convenience and a footgun.
const ports = docker(["port", CONTAINER]).split("\n").join(" ");
if (!(ports.includes("127.0.0.1") || ports.includes("0.0.0.0"))) {
  console.error(
    `"${CONTAINER}" does not look like a local stack — refusing to drop its data.`
  );
  process.exit(1);
}

// The container being local is not enough. This script drops the container's
// database, but the app reads POSTGRES_URL — and a .env.local left pointing at
// a hosted database means the drop silently resets something nobody is looking
// at, while the console the operator opens is untouched and still claimed.
//
// Every path that cannot answer "the app is pointed at this container" refuses.
// A URL this script cannot parse is not permission to drop a database; it is
// the case where it knows least.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

/** Reads a key the way dotenv does: last assignment wins, `export ` allowed. */
function readEnvLocal(key) {
  try {
    const lines = readFileSync(".env.local", "utf8").split("\n");
    let found = null;
    for (const line of lines) {
      const match = line.match(
        new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=(.*)$`)
      );
      if (match) {
        found = match[1];
      }
    }
    return found;
  } catch {
    return null;
  }
}

/** → {status: "local"} | {status: "remote", host} | {status: "unknown", why} */
function configuredTarget() {
  const raw = process.env.POSTGRES_URL ?? readEnvLocal("POSTGRES_URL");
  if (raw === null || raw === undefined || raw.trim() === "") {
    return { status: "unknown", why: "POSTGRES_URL is not set anywhere" };
  }

  const cleaned = raw.trim().replace(/^["']|["']$/g, "");
  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch {
    return {
      status: "unknown",
      why: "POSTGRES_URL could not be parsed as a URL (an unescaped #, ? or / in the password will do this)",
    };
  }

  // The WHATWG parser returns IPv6 hosts bracketed; compare without them.
  // postgresql: is a non-special scheme, so the parser does not lowercase
  // the host the way it would for http:.
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "") {
    return { status: "unknown", why: "POSTGRES_URL has no host" };
  }
  if (!LOCAL_HOSTS.has(host)) {
    return { status: "remote", host };
  }

  // Right host, wrong database is the same bug in miniature: dropping
  // "postgres" while the app reads "guardian" resets something nothing is
  // looking at and leaves the console the operator opens still claimed.
  const database = parsed.pathname.replace(/^\//, "");
  if (database && database !== DATABASE) {
    return { status: "other-database", database };
  }

  return { status: "local" };
}

const target = configuredTarget();

if (target.status === "remote") {
  console.error(
    "Refusing to drop anything.\n\n" +
      `This resets the "${CONTAINER}" container, but POSTGRES_URL points the app at\n` +
      `a different, non-local database (${target.host}). Dropping the container would\n` +
      "reset a database nothing is reading, and leave the console you open still\n" +
      "claimed — while a hosted database is not something to drop by inference.\n\n" +
      "Point POSTGRES_URL at the local stack first, or drop that database yourself."
  );
  process.exit(1);
}

if (target.status === "other-database") {
  console.error(
    "Refusing to drop anything.\n\n" +
      `This resets the "${DATABASE}" database, but POSTGRES_URL points the app at\n` +
      `"${target.database}" on the same host. Dropping "${DATABASE}" would reset a\n` +
      "database nothing is reading, and leave the console you open still claimed.\n\n" +
      `Run it against the right one:  POSTGRES_DB=${target.database} pnpm fresh`
  );
  process.exit(1);
}

if (target.status === "unknown") {
  console.error(
    "Refusing to drop anything.\n\n" +
      `Cannot tell which database the app uses: ${target.why}.\n\n` +
      "This script drops a database, so not knowing is a reason to stop rather\n" +
      "than to guess. Set POSTGRES_URL to the local stack and run it again:\n" +
      "  POSTGRES_URL=postgresql://postgres:postgres@localhost:15432/postgres pnpm fresh"
  );
  process.exit(1);
}

// An unmigrated database has no User table; that is a fine state to reset from,
// so report what can be read and carry on rather than dying on a missing table.
function count(table) {
  try {
    return psql(`select count(*) from "${table}";`).trim();
  } catch {
    return "?";
  }
}

console.log(`Dropping everything in ${containerLabel(CONTAINER)}/${DATABASE}:`);
console.log(`  ${count("User_v1")} account(s), ${count("Host_v1")} machine(s)`);

psql("drop schema public cascade; create schema public;");
psql("drop schema if exists drizzle cascade;");

console.log("Done. Now:");
console.log("  1. docker compose up -d --build");
console.log("     (the migrate step rebuilds the schema)");
console.log(
  "  2. open http://localhost:3000 — it will ask for your SETUP_TOKEN"
);
