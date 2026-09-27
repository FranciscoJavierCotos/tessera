export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

/** Sends transactional email. Implementations: `ConsoleMailer` (Resend in M2). */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}
