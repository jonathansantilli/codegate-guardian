import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatRelativeTime,
  getHostFreshness,
} from "@/lib/security/fleet-presentation";

const NOW = new Date("2026-08-20T12:00:00Z");

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000);
}

describe("getHostFreshness", () => {
  test("a machine that just checked in is online", () => {
    assert.equal(getHostFreshness(hoursAgo(0), NOW), "online");
    assert.equal(getHostFreshness(hoursAgo(23), NOW), "online");
  });

  test("a machine silent for a day is stale", () => {
    assert.equal(getHostFreshness(hoursAgo(24), NOW), "stale");
    assert.equal(getHostFreshness(hoursAgo(100), NOW), "stale");
  });

  test("a machine silent for a week is offline", () => {
    assert.equal(getHostFreshness(hoursAgo(168), NOW), "offline");
    assert.equal(getHostFreshness(hoursAgo(1000), NOW), "offline");
  });

  // A laptop whose clock runs ahead must not be reported as anything but live.
  test("a future timestamp is treated as online", () => {
    assert.equal(getHostFreshness(hoursAgo(-5), NOW), "online");
  });
});

describe("formatRelativeTime", () => {
  test("renders sub-minute gaps as just now", () => {
    assert.equal(formatRelativeTime(hoursAgo(0), NOW), "just now");
  });

  test("renders minutes, hours, and days", () => {
    assert.equal(
      formatRelativeTime(new Date(NOW.getTime() - 5 * 60_000), NOW),
      "5m ago"
    );
    assert.equal(formatRelativeTime(hoursAgo(3), NOW), "3h ago");
    assert.equal(formatRelativeTime(hoursAgo(50), NOW), "2d ago");
  });
});
