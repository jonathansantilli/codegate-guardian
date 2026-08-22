import { expect, test } from "@playwright/test";

/**
 * The console, as a person meets it.
 *
 * These assert the landmarks the sealed design puts on each screen. They are
 * deliberately about what is on the page rather than how it is built: the
 * console is verified against the design, and a screen that silently loses
 * its chrome or its actions should fail here.
 */

const SCREENS: { path: string; landmarks: string[] }[] = [
  {
    path: "/fleet",
    landmarks: ["Guardian", "Fleet reporting", "Overview"],
  },
  { path: "/fleet/machines", landmarks: ["Machines"] },
  { path: "/fleet/inventory", landmarks: ["Inventory"] },
  { path: "/fleet/findings", landmarks: ["Findings"] },
  { path: "/fleet/policies", landmarks: ["Policies"] },
  { path: "/fleet/activity", landmarks: ["Activity"] },
  {
    path: "/fleet/access",
    landmarks: [
      "Endpoints",
      "Enrol a machine",
      "This console is a client of the API below",
    ],
  },
];

test.describe("Feature: the fleet console", () => {
  test("the root is the console", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/fleet$/);
  });

  for (const screen of SCREENS) {
    test(`${screen.path} carries its chrome and its landmarks`, async ({
      page,
    }) => {
      await page.goto(screen.path);

      // The rail is on every screen, with all seven destinations.
      for (const item of [
        "Overview",
        "Machines",
        "Inventory",
        "Findings",
        "Policies",
        "Activity",
        "API & access",
      ]) {
        await expect(page.getByRole("link", { name: item })).toBeVisible();
      }

      for (const landmark of screen.landmarks) {
        await expect(page.getByText(landmark).first()).toBeVisible();
      }

      if (screen.path === "/fleet") {
        await expect(page.getByPlaceholder("Search fleet")).toBeVisible();
      }
    });
  }

  test("search says so when nothing matches, rather than showing nothing", async ({
    page,
  }) => {
    await page.goto("/fleet");
    await page.getByPlaceholder("Search fleet").fill("nothing-matches-this");
    await expect(page.getByText(/Nothing matches/)).toBeVisible();
  });

  test("an unknown machine is refused rather than rendered blank", async ({
    page,
  }) => {
    await page.goto("/fleet/machines/00000000-0000-4000-8000-000000000000");
    await expect(
      page.getByText("That machine is not in this console.")
    ).toBeVisible();
  });
});

test.describe("Feature: agent ingest", () => {
  test("a report with no token is refused", async ({ request }) => {
    const response = await request.post("/api/agent/report", {
      data: { agent: { machineId: "x" }, host: { hostname: "x" } },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(401);
  });

  test("an export of an unknown kind is refused", async ({ page }) => {
    // A bare request would be redirected into guest sign-in and answered 200,
    // so the call is made from a page that already holds a session.
    await page.goto("/fleet");
    const status = await page.evaluate(async () => {
      const response = await fetch("/api/fleet/export?kind=secrets&format=csv");
      return response.status;
    });
    expect(status).toBe(400);
  });

  test("an export of a known kind is served as a download", async ({
    page,
  }) => {
    await page.goto("/fleet");
    const result = await page.evaluate(async () => {
      const response = await fetch(
        "/api/fleet/export?kind=machines&format=csv"
      );
      return {
        status: response.status,
        disposition: response.headers.get("content-disposition"),
      };
    });
    expect(result.status).toBe(200);
    expect(result.disposition).toContain("attachment");
  });
});
