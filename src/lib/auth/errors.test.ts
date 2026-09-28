import { describe, expect, it } from "vitest";

import { authErrorCopy, authErrorFromParams, toAuthErrorCode } from "./errors";

describe("toAuthErrorCode", () => {
  it.each([
    ["invalid_credentials", "invalid_credentials"],
    ["email_not_confirmed", "email_not_confirmed"],
    ["user_already_exists", "user_exists"],
    ["email_exists", "user_exists"],
    ["weak_password", "weak_password"],
    ["otp_expired", "link_expired"],
    ["flow_state_expired", "link_expired"],
    ["access_denied", "oauth_denied"],
    ["over_email_send_rate_limit", "rate_limited"],
    ["over_request_rate_limit", "rate_limited"],
    ["something_new", "unknown"],
    [null, "unknown"],
  ] as const)("maps %s to %s", (raw, expected) => {
    expect(toAuthErrorCode(raw)).toBe(expected);
  });
});

describe("authErrorFromParams", () => {
  it("prefers error_code over error (expired email link)", () => {
    const params = new URLSearchParams(
      "error=access_denied&error_code=otp_expired",
    );
    expect(authErrorFromParams(params)).toBe("link_expired");
  });

  it("falls back to error (OAuth consent denied)", () => {
    const params = new URLSearchParams("error=access_denied");
    expect(authErrorFromParams(params)).toBe("oauth_denied");
  });

  it("is unknown when nothing matches", () => {
    expect(authErrorFromParams(new URLSearchParams())).toBe("unknown");
  });
});

describe("authErrorCopy", () => {
  it("has plain-language copy for every case", () => {
    for (const code of [
      "invalid_credentials",
      "email_not_confirmed",
      "user_exists",
      "weak_password",
      "link_expired",
      "oauth_denied",
      "rate_limited",
      "unknown",
    ] as const) {
      const copy = authErrorCopy(code);
      expect(copy.title).not.toMatch(/_/);
      expect(copy.description.length).toBeGreaterThan(20);
    }
  });
});
