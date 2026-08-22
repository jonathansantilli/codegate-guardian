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
    // Made from a page that holds the operator session, as the console does.
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

test.describe("Feature: the console is not open to anyone who can reach it", () => {
  // No stored session: this is what an unauthenticated caller sees.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a browser is sent to sign in, not handed a session", async ({
    page,
  }) => {
    await page.goto("/fleet");
    await expect(page).toHaveURL(/\/login/);
  });

  for (const route of [
    "/api/fleet",
    "/api/fleet/findings",
    "/api/fleet/export?kind=machines&format=csv",
  ]) {
    test(`${route} answers 401 rather than provisioning a session`, async ({
      request,
    }) => {
      const response = await request.get(route, { maxRedirects: 0 });
      expect(response.status()).toBe(401);
    });
  }

  test("minting an enrolment code requires a session", async ({ request }) => {
    // This was the first step of a chain that ended in the fleet's ingest
    // token: anonymous mint, then redeem at the unauthenticated enrol endpoint.
    const response = await request.post("/api/fleet/enrolment", {
      data: { maxUses: 1 },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(401);
  });
});

test.describe("Feature: a machine can only report as itself", () => {
  /** Mints a code as the operator and enrols a machine with it. */
  async function enrol(
    page: import("@playwright/test").Page,
    machineId: string
  ) {
    const code = await page.evaluate(async () => {
      const response = await fetch("/api/fleet/enrolment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxUses: 1, label: "e2e-impersonation" }),
      });
      return (await response.json()).code as string;
    });

    return page.evaluate(
      async ({ code: c, machineId: m }) => {
        const response = await fetch("/api/agent/enrol", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: c, machineId: m }),
        });
        return (await response.json()).token as string;
      },
      { code, machineId }
    );
  }

  function report(
    page: import("@playwright/test").Page,
    token: string,
    machineId: string,
    findings: unknown[]
  ) {
    return page.evaluate(
      async ({ token: t, machineId: m, findings: f }) => {
        const response = await fetch("/api/agent/report", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${t}`,
          },
          body: JSON.stringify({
            agent: { machineId: m, version: "1.1.0" },
            host: { hostname: m, platform: "linux" },
            collectedAt: new Date().toISOString(),
            inventory: { tools: [{ name: "claude-code" }], items: [] },
            findings: f,
          }),
        });
        return response.status;
      },
      { token, machineId, findings }
    );
  }

  test("one agent cannot resolve another machine's findings by claiming its id", async ({
    page,
  }) => {
    await page.goto("/fleet");
    const stamp = Date.now();
    const victimId = `e2e-victim-${stamp}`;
    const fingerprint = `fp-e2e-${stamp}`;

    const victimToken = await enrol(page, victimId);
    expect(victimToken.startsWith("cgm_")).toBe(true);

    expect(
      await report(page, victimToken, victimId, [
        {
          finding_id: fingerprint,
          rule_id: "known-malicious-content",
          fingerprint,
          severity: "CRITICAL",
          description: "Known-malicious skill installed",
          owasp: [],
        },
      ])
    ).toBe(200);

    // A second machine, enrolled legitimately, claims to be the first.
    const attackerToken = await enrol(page, `e2e-attacker-${stamp}`);
    expect(attackerToken).not.toBe(victimToken);
    expect(await report(page, attackerToken, victimId, [])).toBe(200);

    // The victim's finding must survive: identity comes from the token.
    const status = await page.evaluate(async (fp) => {
      const response = await fetch("/api/fleet/findings");
      const body = await response.json();
      return body.findings.find(
        (f: { fingerprint: string }) => f.fingerprint === fp
      )?.status;
    }, fingerprint);

    expect(status).toBe("open");
  });

  test("an unknown token is refused", async ({ page }) => {
    await page.goto("/fleet");
    expect(await report(page, "cgm_not-a-real-token", "whoever", [])).toBe(401);
  });

  test("enrolment cannot seize a machine that already exists", async ({
    page,
  }) => {
    await page.goto("/fleet");
    const machineId = `e2e-seize-${Date.now()}`;

    const victimToken = await enrol(page, machineId);
    expect(await report(page, victimToken, machineId, [])).toBe(200);

    // A second enrolment claiming the same id must be refused outright —
    // otherwise anyone holding a cohort code takes the machine over, locking
    // the real one out and inheriting its findings.
    const seized = await page.evaluate(async (m) => {
      const code = await fetch("/api/fleet/enrolment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxUses: 1, label: "e2e-seize" }),
      })
        .then((r) => r.json())
        .then((b) => b.code);

      const response = await fetch("/api/agent/enrol", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, machineId: m }),
      });
      return response.status;
    }, machineId);

    expect(seized).toBe(409);
    // And the real machine still works.
    expect(await report(page, victimToken, machineId, [])).toBe(200);
  });
});

test.describe("Feature: registration closes behind the first operator", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("an anonymous visitor cannot create an account once one exists", async ({
    page,
  }) => {
    // The setup project has already registered the operator, so this instance
    // is claimed. Reaching the port must not be one POST from full authority.
    await page.goto("/register");
    await page
      .getByPlaceholder("you@someo.ne")
      .fill(`refused-${Date.now()}@example.test`);
    await page.getByLabel("Password").fill("hunter2hunter2");
    await page.getByRole("button", { name: "Sign up", exact: true }).click();

    await expect(page.getByText(/already has an operator/)).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });
});
