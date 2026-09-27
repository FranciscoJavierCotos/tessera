import "server-only";

import { ConsoleMailer } from "./console";
import type { Mailer } from "./types";

export type { MailMessage, Mailer } from "./types";

/**
 * The app's mailer. Console only for now (dev and preview deploys log the
 * message); M2 adds a Resend implementation selected by env.
 */
export function getMailer(): Mailer {
  return new ConsoleMailer();
}
