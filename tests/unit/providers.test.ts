import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import {
  normalizeGeminiModelId,
  resolveGeminiApiKey,
} from "@/lib/ai/providers";

describe("providers helpers", () => {
  test("normalizes google-prefixed model ids for direct Gemini provider", () => {
    assert.equal(
      normalizeGeminiModelId("google/gemini-2.5-flash"),
      "gemini-2.5-flash"
    );
  });

  test("keeps non-google model ids unchanged", () => {
    assert.equal(
      normalizeGeminiModelId("moonshotai/kimi-k2-0905"),
      "moonshotai/kimi-k2-0905"
    );
  });

  test("prefers GOOGLE_GENERATIVE_AI_API_KEY over GEMINI_API_KEY", () => {
    assert.equal(
      resolveGeminiApiKey({
        GOOGLE_GENERATIVE_AI_API_KEY: "google-key",
        GEMINI_API_KEY: "gemini-key",
      } as unknown as NodeJS.ProcessEnv),
      "google-key"
    );
  });

  test("falls back to GEMINI_API_KEY", () => {
    assert.equal(
      resolveGeminiApiKey({
        GEMINI_API_KEY: "gemini-key",
      } as unknown as NodeJS.ProcessEnv),
      "gemini-key"
    );
  });
});
