import { describe, expect, it } from "vitest";

import {
  createInviteToken,
  hashInviteToken,
  inviteTokenSchema,
  inviteUrl,
} from "./invite-token";

describe("createInviteToken", () => {
  it("returns a 32-byte base64url token and its sha256 hex hash", () => {
    const { token, hash } = createInviteToken();
    expect(inviteTokenSchema.safeParse(token).success).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashInviteToken(token));
  });

  it("never repeats a token", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => createInviteToken().token),
    );
    expect(tokens.size).toBe(50);
  });
});

describe("hashInviteToken", () => {
  it("is sha256 hex of the UTF-8 token (matches the DB)", () => {
    expect(hashInviteToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("inviteTokenSchema", () => {
  it.each(["", "short", "a".repeat(44), `${"a".repeat(42)}=`, "../etc/passwd"])(
    "rejects %j",
    (value) => {
      expect(inviteTokenSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("inviteUrl", () => {
  it("builds an absolute /invite link on the site URL", () => {
    expect(inviteUrl("https://tessera.dev", "tok")).toBe(
      "https://tessera.dev/invite/tok",
    );
  });
});
