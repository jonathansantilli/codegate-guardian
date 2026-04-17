import { expect, test } from "@playwright/test";

// Phase 1 — feature coverage row 28 (/scan page route). The page itself is
// currently a stub (`page.tsx` returns null) served by the chat shell.
// The scenario locks "the route responds, the shell renders" so any
// regression during the refactor is caught.
test.describe("Feature: /scan route", () => {
  test("Given an authenticated session, when navigating to /scan, then the page resolves with the chat shell", async ({
    page,
  }) => {
    const response = await page.goto("/scan", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(500);
    // The input field is part of the shared chat shell; its presence
    // proves the /scan path hit the shell rather than erroring out.
    const input = page.getByTestId("multimodal-input");
    await expect(input).toBeVisible({ timeout: 15_000 });
  });
});
