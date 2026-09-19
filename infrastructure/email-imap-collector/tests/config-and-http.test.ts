import { afterEach, describe, expect, it, vi } from "vitest";

import { parseCollectorSecret } from "../src/config.js";
import { HttpEventSink, RetriableDeliveryError } from "../src/crm-event-sink.js";
import type { NormalizedImapEvent } from "../src/types.js";

const event: NormalizedImapEvent = {
  messageId: "<reply@example.test>",
  references: [],
  from: "pessoa@example.test",
  to: ["pedro@rhcursos.com.br"],
  occurredAt: "2026-09-16T12:00:00.000Z",
  imapUid: "1:10",
  mailbox: "INBOX",
};

describe("collector secret", () => {
  it("aceita somente endpoint HTTPS e segredo forte", () => {
    expect(parseCollectorSecret(JSON.stringify({
      host: "email-ssl.com.br",
      port: 993,
      secure: true,
      user: "pedro@rhcursos.com.br",
      password: "secret-password",
      endpointUrl: "https://rhcursos.com.br/api/internal/email/imap-events",
      webhookSecret: "a".repeat(32),
      rejectUnauthorized: true,
    }))).toMatchObject({ port: 993, secure: true, rejectUnauthorized: true });

    expect(() => parseCollectorSecret(JSON.stringify({
      host: "email-ssl.com.br",
      user: "pedro@rhcursos.com.br",
      password: "password",
      endpointUrl: "http://rhcursos.com.br/api/internal/email/imap-events",
      webhookSecret: "short",
    }))).toThrow();
  });
});

describe("HttpEventSink", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("aceita sucesso e não expõe o segredo no payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const sink = new HttpEventSink("https://rhcursos.com.br/api/internal/email/imap-events", "s".repeat(32), 1000);

    await expect(sink.deliver(event)).resolves.toBe("ACCEPTED");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ "x-rh-webhook-secret": "s".repeat(32) });
    expect(fetchMock.mock.calls[0][1]?.body).not.toContain("s".repeat(32));
  });

  it("considera 422 uma rejeição definitiva", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 422 })));
    const sink = new HttpEventSink("https://rhcursos.com.br/api/internal/email/imap-events", "s".repeat(32), 1000);
    await expect(sink.deliver(event)).resolves.toBe("REJECTED");
  });

  it("repete 503 e falha sem converter em rejeição definitiva", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const sink = new HttpEventSink("https://rhcursos.com.br/api/internal/email/imap-events", "s".repeat(32), 1000);

    await expect(sink.deliver(event)).rejects.toBeInstanceOf(RetriableDeliveryError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
