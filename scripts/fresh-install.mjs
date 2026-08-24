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
 * It refuses to touch anything that is not obviously a local stack.
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
      "  docker compose -f docker/docker-compose.yml up -d"
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
// Worse, that URL is exactly the kind that is not safe to guess at.
function configuredHost() {
  const fromEnv = process.env.POSTGRES_URL;
  const raw = fromEnv ?? readEnvLocal("POSTGRES_URL");
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw.trim().replace(/^["']|["']$/g, "")).hostname;
  } catch {
    return null;
  }
}

function readEnvLocal(key) {
  try {
    const line = readFileSync(".env.local", "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1) : null;
  } catch {
    return null;
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);
const appHost = configuredHost();

if (appHost && !LOCAL_HOSTS.has(appHost)) {
  console.error(
    "Refusing to drop anything.\n\n" +
      `This resets the "${CONTAINER}" container, but POSTGRES_URL points the app at\n` +
      `a different, non-local database (${appHost}). Dropping the container would\n` +
      "reset a database nothing is reading, and leave the console you open still\n" +
      "claimed — while a hosted database is not something to drop by inference.\n\n" +
      "Point POSTGRES_URL at the local stack first, or drop that database yourself."
  );
  process.exit(1);
}

const users = psql('select count(*) from "User";').trim();
const hosts = psql('select count(*) from "Host_v1";').trim();

console.log(`Dropping everything in ${CONTAINER}/${DATABASE}:`);
console.log(`  ${users} account(s), ${hosts} machine(s)`);

psql("drop schema public cascade; create schema public;");
psql("drop schema if exists drizzle cascade;");

console.log("Done. Now:");
console.log("  1. docker compose -f docker/docker-compose.yml up -d --build");
console.log("     (the migrate step rebuilds the schema)");
console.log(
  "  2. open http://localhost:3000 — it will ask for your SETUP_TOKEN"
);
