import { describe, expect, it, vi } from "vitest";

import { ConsoleMailer } from "./console";
import { inviteEmail } from "./templates";

describe("inviteEmail", () => {
  const message = inviteEmail({
    to: "ada@example.com",
    workspaceName: "Acme",
    inviterName: "Grace",
    role: "admin",
    link: "https://tessera.dev/invite/tok",
    expiresAt: new Date("2026-10-04T12:00:00Z"),
  });

  it("addresses the invitee and names the inviter and workspace", () => {
    expect(message.to).toBe("ada@example.com");
    expect(message.subject).toBe("Grace invited you to Acme on Tessera");
  });

  it("contains the link, the role and the UTC expiry date", () => {
    expect(message.text).toContain("https://tessera.dev/invite/tok");
    expect(message.text).toContain("as admin");
    expect(message.text).toContain("2026-10-04 (UTC)");
  });

  it("falls back when the inviter has no name", () => {
    expect(
      inviteEmail({
        to: "ada@example.com",
        workspaceName: "Acme",
        inviterName: null,
        role: "member",
        link: "https://tessera.dev/invite/tok",
        expiresAt: new Date("2026-10-04T12:00:00Z"),
      }).subject,
    ).toBe("A teammate invited you to Acme on Tessera");
  });
});

describe("ConsoleMailer", () => {
  it("logs the message instead of sending it", async () => {
    const log = vi.fn();
    await new ConsoleMailer(log).send({
      to: "ada@example.com",
      subject: "Hi",
      text: "Body",
    });
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain("to: ada@example.com");
    expect(log.mock.calls[0]?.[0]).toContain("Body");
  });
});
