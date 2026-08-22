import path from "node:path";
import { expect, test as setup } from "@playwright/test";

/**
 * Gets an operator session, and saves it for the specs that need one.
 *
 * Registration closes behind the first operator, so this cannot simply
 * register every run: on a fresh database it bootstraps the instance, and on
 * one that is already claimed it signs in. Both paths end with a session,
 * which is all the suite needs.
 */

export const OPERATOR_STATE = path.join(
  process.cwd(),
  "tests/e2e/.auth/operator.json"
);

const EMAIL = process.env.E2E_OPERATOR_EMAIL ?? "e2e-operator@example.test";
const PASSWORD =
  process.env.E2E_OPERATOR_PASSWORD ?? "correct-horse-battery-staple";

setup("sign in as an operator, bootstrapping if needed", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("you@someo.ne").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  const signedIn = await page
    .waitForURL(/\/fleet/, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);

  if (!signedIn) {
    // No such account yet: claim the instance as its first operator.
    await page.goto("/register");
    await page.getByPlaceholder("you@someo.ne").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign up", exact: true }).click();
    await page.waitForURL(/\/fleet/, { timeout: 30_000 });
  }

  // Exact: the sign-in panel copy also begins "Fleet reporting for…".
  await expect(
    page.getByText("Fleet reporting", { exact: true })
  ).toBeVisible();

  await page.context().storageState({ path: OPERATOR_STATE });
});
