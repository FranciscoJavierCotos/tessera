import { describe, expect, it } from "vitest";

import { credentialsInput, PASSWORD_MAX_LENGTH } from "./credentials";

describe("credentialsInput", () => {
  it("accepts a sign-in and trims the email", () => {
    const parsed = credentialsInput.parse({
      mode: "sign-in",
      email: "  ada@example.com ",
      password: "short",
    });
    expect(parsed.email).toBe("ada@example.com");
  });

  it("requires a password to sign in", () => {
    const result = credentialsInput.safeParse({
      mode: "sign-in",
      email: "ada@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter your password.");
  });

  it("enforces the minimum length only when creating an account", () => {
    const result = credentialsInput.safeParse({
      mode: "sign-up",
      email: "ada@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Use at least 8 characters.");

    expect(
      credentialsInput.safeParse({
        mode: "sign-up",
        email: "ada@example.com",
        password: "long enough",
      }).success,
    ).toBe(true);
  });

  it("rejects passwords longer than bcrypt reads", () => {
    for (const mode of ["sign-in", "sign-up"] as const) {
      expect(
        credentialsInput.safeParse({
          mode,
          email: "ada@example.com",
          password: "x".repeat(PASSWORD_MAX_LENGTH + 1),
        }).success,
      ).toBe(false);
    }
  });

  it("rejects an invalid email and an unknown mode", () => {
    expect(
      credentialsInput.safeParse({
        mode: "sign-in",
        email: "not-an-email",
        password: "secret",
      }).success,
    ).toBe(false);
    expect(
      credentialsInput.safeParse({
        mode: "magic-link",
        email: "ada@example.com",
        password: "secret",
      }).success,
    ).toBe(false);
  });
});
