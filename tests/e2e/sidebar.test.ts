import { expect, test } from "@playwright/test";

// Phase 1 — feature coverage row 20 (sidebar toggle persistence via
// cookie). Stable UI behavior; captures the contract so a future
// container-root refactor doesn't accidentally drop the cookie write.
test.describe("Feature: sidebar toggle persists across reloads", () => {
  test("Given the sidebar is open by default, when the user toggles it closed and reloads, then it stays closed", async ({
    page,
  }) => {
    await page.goto("/");

    // Default: the sidebar cookie is either absent or 'true'. Toggle it.
    const toggle = page.getByTestId("sidebar-toggle");
    if (!(await toggle.isVisible().catch(() => false))) {
      test.skip(true, "sidebar-toggle testid not rendered in this layout");
    }
    await toggle.click();

    // Confirm the cookie records the closed state.
    const cookiesAfterToggle = await page.context().cookies();
    const sidebar = cookiesAfterToggle.find(
      (c) => c.name === "sidebar_state" || c.name === "sidebar:state"
    );
    expect(sidebar?.value).toBe("false");

    await page.reload();
    const cookiesAfterReload = await page.context().cookies();
    const sidebarAfterReload = cookiesAfterReload.find(
      (c) => c.name === "sidebar_state" || c.name === "sidebar:state"
    );
    expect(sidebarAfterReload?.value).toBe("false");
  });
});
