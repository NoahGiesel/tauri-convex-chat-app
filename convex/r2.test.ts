import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { r2 } from "./r2";

const KEYS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_JURISDICTION", "R2_ENDPOINT"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, { R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "id", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET: "media" });
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("r2 endpoint", () => {
  it("is the account's R2 host when no endpoint is set", () => {
    expect(r2().endpoint).toBe("https://acct.r2.cloudflarestorage.com/media");
  });

  it("keeps the jurisdiction in the host", () => {
    process.env.R2_JURISDICTION = "eu";
    expect(r2().endpoint).toBe("https://acct.eu.r2.cloudflarestorage.com/media");
  });

  it("is the set endpoint, for the E2E stub", () => {
    process.env.R2_ENDPOINT = "http://127.0.0.1:3312";
    expect(r2().endpoint).toBe("http://127.0.0.1:3312/media");
  });
});
