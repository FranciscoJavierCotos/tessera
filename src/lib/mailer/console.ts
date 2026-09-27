import type { MailMessage, Mailer } from "./types";

/** Writes each message to the server log instead of sending it. */
export class ConsoleMailer implements Mailer {
  constructor(private readonly log: (line: string) => void = console.info) {}

  async send({ to, subject, text }: MailMessage): Promise<void> {
    this.log(`[mail] to: ${to}\n[mail] subject: ${subject}\n\n${text}\n`);
  }
}
