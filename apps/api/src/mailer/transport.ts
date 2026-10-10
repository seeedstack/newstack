// §9: sends use the provider's idempotency key = outbox id. No real provider (Postmark/SES/
// Resend) credentials exist yet — this console transport is the dev/test stand-in; a real
// provider adapter slots in here later behind the same MailTransport interface.
export interface MailMessage {
  to: string;
  subject: string;
  body: string;
  idempotencyKey: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export class ConsoleMailTransport implements MailTransport {
  async send(message: MailMessage): Promise<void> {
    console.log(
      `[mailer] to=${message.to} subject="${message.subject}" idempotencyKey=${message.idempotencyKey}\n${message.body}`
    );
  }
}
