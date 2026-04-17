import { expect, test } from "@playwright/test";

// Phase 1 — feature coverage row 48 (middleware): /ping liveness.
// Intentionally minimal; the redirect flow is exercised by the guest
// auto-provision path (covered in Phase 11 alongside the auth use case).
test.describe("Feature: proxy middleware — liveness", () => {
  test("Given a GET /ping request, when no auth exists, then /ping responds 200 'pong' without redirect", async ({
    request,
  }) => {
    const response = await request.get("/ping", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toBe("pong");
  });
});
