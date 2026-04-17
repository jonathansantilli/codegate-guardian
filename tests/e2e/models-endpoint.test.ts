import { expect, test } from "@playwright/test";

// Phase 1 — feature coverage rows 51, 53 (`/api/models` shape). Phase 4
// replaces the AI-Gateway-fetched capability map with a static registry,
// but the response contract consumed by the client (`multimodal-input`
// useSWR call) must stay the same. This test locks the shape.
test.describe("Feature: /api/models response contract", () => {
  test("Given a request to /api/models, when not in demo mode, then the response is a Record<modelId, ModelCapabilities>", async ({
    request,
  }) => {
    const response = await request.get("/api/models");
    expect(response.status()).toBe(200);

    const body: unknown = await response.json();
    expect(typeof body).toBe("object");
    expect(body).not.toBeNull();

    // The handler returns either { capabilities, models } (demo or
    // when local CLI models are enabled) or a plain capability map.
    // Both shapes carry ModelCapabilities for `google/gemini-2.5-pro`.
    const record = body as Record<string, unknown>;
    const directKey = "google/gemini-2.5-pro";
    const asCapabilityMap = record[directKey];
    const asContainer = (record.capabilities as Record<string, unknown>)?.[
      directKey
    ];
    const capabilities = asCapabilityMap ?? asContainer;

    expect(capabilities).toBeTruthy();
    const shape = capabilities as {
      tools: boolean;
      vision: boolean;
      reasoning: boolean;
    };
    expect(typeof shape.tools).toBe("boolean");
    expect(typeof shape.vision).toBe("boolean");
    expect(typeof shape.reasoning).toBe("boolean");
  });
});
