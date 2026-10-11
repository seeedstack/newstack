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

// Resend over plain fetch — no SDK dependency for one POST call. Picked over Postmark/SES
// because its REST API takes an `Idempotency-Key` header directly, matching §9's "provider's
// idempotency key = outbox id" without any extra dedup bookkeeping on our side.
export class ResendMailTransport implements MailTransport {
  constructor(private readonly apiKey: string, private readonly from: string) {}

  async send(message: MailMessage): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({ from: this.from, to: message.to, subject: message.subject, text: message.body }),
    });
    if (!response.ok) {
      throw new Error(`resend: ${response.status} ${await response.text()}`);
    }
  }
}
