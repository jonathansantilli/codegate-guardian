import { expect, test } from "@playwright/test";

// /ping is the liveness probe: it must answer before any session gate, so a
// container health check never depends on authentication.
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
