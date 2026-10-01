export type MailMessage = { to: string; subject: string; text: string };

/** The seam for a real provider (SMTP, Resend, …): implement this and nothing else changes. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Development: writes the message, link included, to the log. This is the one
 * deliberate exception to "never log tokens" — never use it in production.
 */
export class ConsoleMailer implements Mailer {
  readonly #log: (line: string) => void;

  constructor(log: (line: string) => void) {
    this.#log = log;
  }

  async send(message: MailMessage) {
    this.#log(`[mail] to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}

/** Tests: keeps messages so a test can follow the link like a user would. */
export class MemoryMailer implements Mailer {
  readonly messages: MailMessage[] = [];

  async send(message: MailMessage) {
    this.messages.push(message);
  }

  tokenFor(to: string) {
    const message = [...this.messages].reverse().find((candidate) => candidate.to === to);
    const token = message?.text.match(/token=([\w-]+)/)?.[1];

    if (!token) throw new Error(`No link was mailed to ${to}`);

    return token;
  }
}
