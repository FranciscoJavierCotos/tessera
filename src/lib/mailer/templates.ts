import { ROLE_LABELS, type WorkspaceRole } from "@/lib/workspace/roles";

import type { MailMessage } from "./types";

export function inviteEmail({
  to,
  workspaceName,
  inviterName,
  role,
  link,
  expiresAt,
}: {
  to: string;
  workspaceName: string;
  inviterName: string | null;
  role: WorkspaceRole;
  link: string;
  expiresAt: Date;
}): MailMessage {
  const who = inviterName ?? "A teammate";
  const expires = expiresAt.toISOString().slice(0, 10);
  return {
    to,
    subject: `${who} invited you to ${workspaceName} on Tessera`,
    text: [
      `${who} invited you to join ${workspaceName} on Tessera as ${ROLE_LABELS[role].toLowerCase()}.`,
      "",
      `Accept the invite: ${link}`,
      "",
      `The link expires on ${expires} (UTC) and only works for ${to}.`,
      "If you were not expecting this, you can ignore this email.",
    ].join("\n"),
  };
}
