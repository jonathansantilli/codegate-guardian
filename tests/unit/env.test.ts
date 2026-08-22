import { strict as assert } from "node:assert/strict";
import { describe, test } from "node:test";
import {
  EnvValidationError,
  loadEnv,
} from "@/src/infrastructure/composition/env";

const REQUIRED = {
  AUTH_SECRET: "test-secret",
  POSTGRES_URL: "postgres://test:test@localhost:5432/test",
};

// NodeJS.ProcessEnv requires NODE_ENV, which every case here shares.
function processEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...overrides } as NodeJS.ProcessEnv;
}

describe("loadEnv", () => {
  test("applies defaults for a minimal environment", () => {
    const env = loadEnv(processEnv({ ...REQUIRED }));

    assert.equal(env.APP_URL, "http://localhost:3000");
    assert.equal(env.OBJECT_STORE_DRIVER, "filesystem");
    assert.equal(env.OBJECT_STORE_PATH, "./data/uploads");
    assert.equal(env.S3_REGION, "us-east-1");
    assert.equal(env.IS_DEMO, false);
  });

  test("rejects a missing required variable", () => {
    assert.throws(
      () => loadEnv(processEnv({ POSTGRES_URL: REQUIRED.POSTGRES_URL })),
      EnvValidationError
    );
  });

  // `docker compose` renders ${VAR:-} as an empty string, so an unset optional
  // variable arrives as "" rather than as an absent key.
  test("treats an empty optional variable as unset", () => {
    const env = loadEnv(
      processEnv({
        ...REQUIRED,
        REDIS_URL: "",
        S3_BUCKET: "",
      })
    );

    assert.equal(env.REDIS_URL, undefined);
    assert.equal(env.S3_BUCKET, undefined);
  });

  test("falls back to the default when a defaulted variable is empty", () => {
    const env = loadEnv(
      processEnv({
        ...REQUIRED,
        APP_URL: "",
        OBJECT_STORE_PATH: "   ",
        S3_REGION: "",
      })
    );

    assert.equal(env.APP_URL, "http://localhost:3000");
    assert.equal(env.OBJECT_STORE_PATH, "./data/uploads");
    assert.equal(env.S3_REGION, "us-east-1");
  });

  test("keeps real values and trims them", () => {
    const env = loadEnv(
      processEnv({
        ...REQUIRED,
        APP_URL: "  https://guardian.example.com  ",
      })
    );

    assert.equal(env.APP_URL, "https://guardian.example.com");
  });

  test("parses boolean-ish flags", () => {
    assert.equal(
      loadEnv(processEnv({ ...REQUIRED, IS_DEMO: "1" })).IS_DEMO,
      true
    );
    assert.equal(
      loadEnv(processEnv({ ...REQUIRED, IS_DEMO: "true" })).IS_DEMO,
      true
    );
    assert.equal(
      loadEnv(processEnv({ ...REQUIRED, IS_DEMO: "no" })).IS_DEMO,
      false
    );
    assert.equal(
      loadEnv(processEnv({ ...REQUIRED, IS_DEMO: "" })).IS_DEMO,
      false
    );
  });

  test("rejects an unknown object store driver", () => {
    assert.throws(
      () => loadEnv(processEnv({ ...REQUIRED, OBJECT_STORE_DRIVER: "gcs" })),
      EnvValidationError
    );
  });
});
