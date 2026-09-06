import { expect, test } from "@playwright/test";

// These are the signed-out screens; a stored session would be redirected away
// from them before the first assertion. The setup project has already claimed
// the instance, so what they describe is a console that has its operator.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Authentication Pages", () => {
  test("login page renders correctly, and does not offer sign-up", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByPlaceholder("you@someo.ne")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    // One operator per instance: once it is claimed there is nothing to sign
    // up to, so the offer is gone. The link streams in, so let the page settle
    // before asserting its absence.
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("No account?")).toHaveCount(0);
  });

  test("register page says the console has its operator", async ({ page }) => {
    await page.goto("/register");
    await expect(
      page.getByRole("heading", { name: "This console has its operator" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    // The claim form is in the document but stands aside: nothing to fill in.
    await expect(page.getByPlaceholder("you@someo.ne")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Sign up", exact: true })
    ).toBeHidden();
  });

  test("can navigate from register to login", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/login");
  });
});
