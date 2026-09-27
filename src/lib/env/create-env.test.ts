import { describe, expect, it } from "vitest";

import { createEnv, EnvValidationError } from "./create-env";

const valid = {
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

describe("createEnv", () => {
  it("returns typed values when every variable is valid", () => {
    const env = createEnv({ runtimeEnv: valid, isServer: true });

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("service-role-key");
  });

  it("lists every missing variable in one readable error", () => {
    const run = () =>
      createEnv({
        runtimeEnv: {
          ...valid,
          SUPABASE_SERVICE_ROLE_KEY: undefined,
          NEXT_PUBLIC_SITE_URL: "",
        },
        isServer: true,
      });

    expect(run).toThrow(EnvValidationError);
    expect(run).toThrow(/SUPABASE_SERVICE_ROLE_KEY: missing/);
    expect(run).toThrow(/NEXT_PUBLIC_SITE_URL: missing/);
  });

  it("rejects malformed URLs", () => {
    expect(() =>
      createEnv({
        runtimeEnv: { ...valid, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" },
        isServer: true,
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL: (?!missing)/);
  });

  it("does not require server variables on the client", () => {
    const env = createEnv({
      runtimeEnv: { ...valid, SUPABASE_SERVICE_ROLE_KEY: undefined },
      isServer: false,
    });

    expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
  });

  it("throws when client code reads a server variable", () => {
    const env = createEnv({ runtimeEnv: valid, isServer: false });

    expect(() => env.SUPABASE_SERVICE_ROLE_KEY).toThrow(/Server-only env var/);
  });

  it("skips validation when asked", () => {
    const env = createEnv({
      runtimeEnv: { ...valid, SUPABASE_SERVICE_ROLE_KEY: undefined },
      isServer: true,
      skipValidation: true,
    });

    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });
});
