import { afterEach, describe, expect, it, vi } from "vitest";

import { ResendMailTransport } from "../src/mailer/transport.js";

afterEach(() => vi.unstubAllGlobals());

describe("ResendMailTransport", () => {
  it("posts to Resend with the idempotency key and from address", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const transport = new ResendMailTransport("test-key", "noreply@newstack.example");
    await transport.send({ to: "user@mail.example", subject: "Subject", body: "Body", idempotencyKey: "outbox-1" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Idempotency-Key": "outbox-1",
    });
    expect(JSON.parse(init.body)).toEqual({
      from: "noreply@newstack.example",
      to: "user@mail.example",
      subject: "Subject",
      text: "Body",
    });
  });

  it("throws on a non-2xx response so the mailer's retry/backoff picks it up", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad request", { status: 400 })));

    const transport = new ResendMailTransport("test-key", "noreply@newstack.example");
    await expect(
      transport.send({ to: "user@mail.example", subject: "s", body: "b", idempotencyKey: "outbox-2" })
    ).rejects.toThrow("resend: 400 bad request");
  });
});
