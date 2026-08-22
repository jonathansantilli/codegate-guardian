import path from "node:path";
import { expect, test as setup } from "@playwright/test";

/**
 * Signs in an operator once, and saves the session for the specs that need one.
 *
 * The console no longer provisions anonymous sessions, so a test has to get in
 * the way a person does: register, then land on the console. Registration is
 * how a self-hosted instance gets its first operator.
 */

export const OPERATOR_STATE = path.join(
  process.cwd(),
  "tests/e2e/.auth/operator.json"
);

setup("register an operator and keep the session", async ({ page }) => {
  // Unique per run: the account persists in whatever database the run targets.
  const email = `operator-${Date.now()}@example.test`;

  await page.goto("/register");
  await page.getByPlaceholder("you@someo.ne").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();

  await page.waitForURL(/\/fleet/, { timeout: 30_000 });
  // Exact: the sign-in panel copy also begins "Fleet reporting for…".
  await expect(
    page.getByText("Fleet reporting", { exact: true })
  ).toBeVisible();

  await page.context().storageState({ path: OPERATOR_STATE });
});
