import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import { machineStatus } from "@/components/fleet/ui";
import {
  displayPath,
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

describe("displayPath", () => {
  test("keeps the tail, which is the part that identifies the file", () => {
    assert.equal(
      displayPath(
        "/private/tmp/build-1234/work/.claude/skills/podcast/SKILL.md"
      ),
      "…/skills/podcast/SKILL.md"
    );
  });

  test("leaves a short path alone", () => {
    assert.equal(displayPath("/etc/hosts"), "/etc/hosts");
  });

  test("collapses the owner's home directory the way the machine shows it", () => {
    assert.equal(
      displayPath("/Users/jonathan/.claude/settings.json", {
        username: "jonathan",
      }),
      "~/.claude/settings.json"
    );
  });

  test("collapses a linux home directory too", () => {
    assert.equal(
      displayPath("/home/priya/.claude/CLAUDE.md", { username: "priya" }),
      "~/.claude/CLAUDE.md"
    );
  });

  test("does not collapse another user's home directory", () => {
    assert.equal(
      displayPath("/Users/someone-else/.claude/settings.json", {
        username: "jonathan",
      }),
      "…/someone-else/.claude/settings.json"
    );
  });

  test("does not treat a username as a regular expression", () => {
    assert.equal(
      displayPath("/Users/a.b/.claude/x.json", { username: "a.b" }),
      "~/.claude/x.json"
    );
  });
});

describe("machineStatus", () => {
  test("a revoked machine reads as revoked, not as merely stale", () => {
    const status = machineStatus(
      "stale",
      new Date("2026-08-01T00:00:00Z"),
      NOW,
      null
    );
    assert.equal(status.label, "Revoked");
  });

  test("revocation outranks even a machine still reporting", () => {
    // The last report can be minutes old and the door still closed.
    assert.equal(
      machineStatus("online", new Date(), NOW, null).label,
      "Revoked"
    );
  });

  test("an unrevoked machine reads by how recently it reported", () => {
    assert.equal(machineStatus("online", null, NOW, null).label, "Reporting");
    assert.equal(machineStatus("stale", null, NOW, null).label, "Stale");
    assert.equal(
      machineStatus("offline", null, NOW, null).label,
      "No recent reports"
    );
  });
});

describe("machineStatus for a machine an operator reopened", () => {
  // A restored machine holds no credential until its agent comes back, and
  // during that window any holder of a live enrolment code could claim it.
  // An operator has to be able to see that, not infer it.
  test("an open enrolment window is its own state, not silence", () => {
    assert.equal(
      machineStatus("offline", null, NOW, new Date()).label,
      "Awaiting re-enrolment"
    );
  });

  test("it reads as awaiting even while the last report is still fresh", () => {
    assert.equal(
      machineStatus("online", null, NOW, new Date()).label,
      "Awaiting re-enrolment"
    );
  });

  // Revocation and an open window are mutually exclusive in practice —
  // restoring clears revokedAt — but if both were ever set, refusing reports
  // is the more important fact.
  test("revocation still outranks an open window", () => {
    assert.equal(
      machineStatus("online", new Date(), NOW, new Date()).label,
      "Revoked"
    );
  });
});

describe("machineStatus for a machine that has never reported", () => {
  test("enrolling is not reporting", () => {
    // Enrolment stamps lastSeenAt, so freshness alone called it healthy.
    assert.equal(
      machineStatus("online", null, null, null).label,
      "Never reported"
    );
  });

  test("revocation still outranks it", () => {
    assert.equal(
      machineStatus("online", new Date(), null, null).label,
      "Revoked"
    );
  });
});
