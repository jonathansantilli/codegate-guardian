#!/usr/bin/env node
/**
 * Deletes history the console no longer needs.
 *
 * Every machine writes a report on every check-in, and nothing removed them,
 * so the tables that grow are the ones a real fleet fills fastest. Run this
 * from cron on a self-hosted instance:
 *
 *   0 4 * * *  cd /srv/guardian && pnpm prune
 *
 * Two reports per machine survive any cutoff: its latest, which lastSeenAt
 * and the current inventory come from, and its latest findings-bearing one,
 * which the whole finding lifecycle is derived from. Pruning that second one
 * would make every finding on that machine disappear — a console reporting a
 * compromised machine as clean is worse than one reporting nothing.
 *
 *   REPORT_RETENTION_DAYS    default 90
 *   ACTIVITY_RETENTION_DAYS  default 180
 */

import { buildContainer } from "@/src/infrastructure/composition/container";

const DAY_MS = 24 * 60 * 60 * 1000;

function days(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`${name} must be a positive number of days, got: ${raw}`);
    process.exit(1);
  }
  return value;
}

const reportDays = days("REPORT_RETENTION_DAYS", 90);
const activityDays = days("ACTIVITY_RETENTION_DAYS", 180);

const runPrune = async () => {
  const now = new Date();
  const container = buildContainer();

  try {
    const removed = await container.ports.fleet.pruneHistory({
      reportsBefore: new Date(now.getTime() - reportDays * DAY_MS),
      activityBefore: new Date(now.getTime() - activityDays * DAY_MS),
      // Sign-in throttle windows stop meaning anything once they close; a day
      // is far longer than the fifteen minutes they are counted over.
      signInAttemptsBefore: new Date(now.getTime() - DAY_MS),
    });

    console.log(
      `Pruned ${removed.reports} report(s) older than ${reportDays} days, ` +
        `${removed.activity} activity row(s) older than ${activityDays} days, ` +
        `${removed.signInAttempts} expired sign-in window(s).`
    );
  } finally {
    await container.shutdown();
  }
};

runPrune().catch((error) => {
  console.error("Pruning failed");
  console.error(error);
  process.exit(1);
});
