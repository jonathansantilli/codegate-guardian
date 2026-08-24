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

const CONTAINER =
  process.env.POSTGRES_CONTAINER ?? "codegate-guardian-postgres";
const DATABASE = process.env.POSTGRES_DB ?? "postgres";

function docker(args, options = {}) {
  return execFileSync("docker", args, { encoding: "utf8", ...options }).trim();
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

try {
  docker(["inspect", CONTAINER], { stdio: ["ignore", "pipe", "ignore"] });
} catch {
  console.error(
    `No container named "${CONTAINER}". Start the stack first:\n` +
      "  docker compose up -d"
  );
  process.exit(1);
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
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (host === "") {
    return { status: "unknown", why: "POSTGRES_URL has no host" };
  }
  return LOCAL_HOSTS.has(host)
    ? { status: "local" }
    : { status: "remote", host };
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

if (target.status === "unknown") {
  console.error(
    "Refusing to drop anything.\n\n" +
      `Cannot tell which database the app uses: ${target.why}.\n\n` +
      "This script drops a database, so not knowing is a reason to stop rather\n" +
      "than to guess. Set POSTGRES_URL to the local stack and run it again:\n" +
      "  POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/postgres pnpm fresh"
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

console.log(`Dropping everything in ${CONTAINER}/${DATABASE}:`);
console.log(`  ${count("User")} account(s), ${count("Host_v1")} machine(s)`);

psql("drop schema public cascade; create schema public;");
psql("drop schema if exists drizzle cascade;");

console.log("Done. Now:");
console.log("  1. docker compose up -d --build");
console.log("     (the migrate step rebuilds the schema)");
console.log(
  "  2. open http://localhost:3000 — it will ask for your SETUP_TOKEN"
);
