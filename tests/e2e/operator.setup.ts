import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const CREDENTIAL_FILE = path.join(
  process.cwd(),
  "tests/e2e/.auth/operator-credential.json"
);

/**
 * Generated on first use and kept beside the session state, which is
 * gitignored.
 *
 * A committed default would be a known password on a full operator account
 * for every instance this suite has ever run against, including a dev stack
 * someone left reachable. Generating it per RUN instead would lock the suite
 * out of a database an earlier run claimed — so it is generated once, stored
 * where it is not committed, and reused.
 */
function operatorPassword(): string {
  if (process.env.E2E_OPERATOR_PASSWORD) {
    return process.env.E2E_OPERATOR_PASSWORD;
  }

  if (existsSync(CREDENTIAL_FILE)) {
    return JSON.parse(readFileSync(CREDENTIAL_FILE, "utf8")).password;
  }

  const password = `e2e-${randomBytes(24).toString("base64url")}`;
  mkdirSync(path.dirname(CREDENTIAL_FILE), { recursive: true });
  writeFileSync(CREDENTIAL_FILE, JSON.stringify({ password }), { mode: 0o600 });
  return password;
}

const PASSWORD = operatorPassword();

setup("sign in as an operator, bootstrapping if needed", async ({ page }) => {
  // A session cookie is encrypted with AUTH_SECRET. A stored state written
  // under a different secret — a previous run invoked another way, or a
  // rotated secret — is not merely useless: the server logs a
  // JWTSessionError for every /api/auth/session poll, which reads as a
  // console fault when it is a stale test artefact. Start from nothing.
  await page.context().clearCookies();

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

    // Claiming an unclaimed instance needs the token the deployer set.
    const setupToken = page.getByLabel("Setup token");
    if (await setupToken.isVisible().catch(() => false)) {
      await setupToken.fill(process.env.SETUP_TOKEN ?? "");
    }

    await page.getByRole("button", { name: "Sign up", exact: true }).click();
    await page.waitForURL(/\/fleet/, { timeout: 30_000 });
  }

  // Exact: the sign-in panel copy also begins "Fleet reporting for…".
  await expect(
    page.getByText("Fleet reporting", { exact: true })
  ).toBeVisible();

  await page.context().storageState({ path: OPERATOR_STATE });
});
