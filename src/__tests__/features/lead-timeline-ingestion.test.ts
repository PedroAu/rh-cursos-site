import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ingestImapEvent,
  ingestSesEvent,
  ingestUnsubscribeEvent,
  normalizedImapEventSchema,
} from "@/features/admin/leads/timeline/ingestion";

const messageLink = {
  id: "10000000-0000-0000-0000-000000000001",
  lead_id: "lead-1",
  sequence_id: "20000000-0000-0000-0000-000000000002",
  provider_message_id: "ses-message-1",
  rfc_message_id: "outbound@example.test",
};

function createClient() {
  const rpc = vi.fn().mockResolvedValue({
    data: [{ interaction_id: "30000000-0000-0000-0000-000000000003", duplicate: false, sequence_interrupted: false }],
    error: null,
  });
  const from = vi.fn((table: string) => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.ilike = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: table === "lead_email_message" ? messageLink : { id: "lead-1" }, error: null });
    chain.in = vi.fn().mockResolvedValue({ data: table === "lead_email_message" ? [messageLink] : [], error: null });
    return chain;
  });
  return { client: { from, rpc } as never, from, rpc };
}

describe("timeline ingestion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normaliza SES, preserva horário do provedor e gera idempotência estável", async () => {
    const { client, rpc } = createClient();
    const payload = {
      id: "eventbridge-event-1",
      source: "aws.ses",
      detail: {
        eventType: "Open",
        mail: { messageId: "ses-message-1", timestamp: "2026-09-16T10:00:00.000Z", tags: {} },
        open: { timestamp: "2026-09-16T10:01:00.000Z" },
      },
    };

    await ingestSesEvent(client, payload);
    await ingestSesEvent(client, payload);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_event_type: "OPENED",
      p_occurred_at: "2026-09-16T10:01:00.000Z",
      p_idempotency_key: "ses:eventbridge-event-1",
      p_lead_id: "lead-1",
    });
    expect(rpc.mock.calls[1][1].p_event_hash).toBe(rpc.mock.calls[0][1].p_event_hash);
  });

  it("registra supressao da validacao automatica como bounce terminal auditavel", async () => {
    const { client, rpc } = createClient();
    await ingestSesEvent(client, {
      id: "eventbridge-validation-1",
      source: "aws.ses",
      detail: {
        eventType: "Bounce",
        mail: { messageId: "ses-message-1", timestamp: "2026-09-21T10:00:00.000Z", tags: {} },
        bounce: {
          timestamp: "2026-09-21T10:00:01.000Z",
          bounceType: "Permanent",
          bounceSubType: "EmailValidationSuppressed",
        },
      },
    });

    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_event_type: "BOUNCED",
      p_safe_summary: "Endereço bloqueado pela validação automática do Amazon SES.",
      p_metadata: {
        provider: "SES",
        bounce_type: "Permanent",
        bounce_subtype: "EmailValidationSuppressed",
      },
    });
  });

  it("preserva a idempotencia legada sem envelope quando surge bounce subtype", async () => {
    const first = createClient();
    const second = createClient();
    const base = {
      eventType: "Bounce" as const,
      mail: { messageId: "ses-message-1", timestamp: "2026-09-21T10:00:00.000Z", tags: {} },
      bounce: { timestamp: "2026-09-21T10:00:01.000Z", bounceType: "Permanent" },
    };
    await ingestSesEvent(first.client, base);
    await ingestSesEvent(second.client, {
      ...base,
      bounce: { ...base.bounce, bounceSubType: "EmailValidationSuppressed" },
    });
    expect(second.rpc.mock.calls[0][1].p_external_event_id).toBe(first.rpc.mock.calls[0][1].p_external_event_id);
    expect(second.rpc.mock.calls[0][1].p_idempotency_key).toBe(first.rpc.mock.calls[0][1].p_idempotency_key);
    expect(second.rpc.mock.calls[0][1].p_event_hash).not.toBe(first.rpc.mock.calls[0][1].p_event_hash);
  });

  it("rejeita detalhes de bounce em outro tipo de evento", async () => {
    const { client } = createClient();
    await expect(ingestSesEvent(client, {
      source: "aws.ses",
      detail: {
        eventType: "Delivery",
        mail: { messageId: "ses-message-1", timestamp: "2026-09-21T10:00:00.000Z", tags: {} },
        bounce: { bounceSubType: "EmailValidationSuppressed" },
      },
    })).rejects.toThrow();
  });

  it("correlaciona resposta IMAP primeiro por In-Reply-To e nunca persiste corpo", async () => {
    const { client, rpc } = createClient();
    await ingestImapEvent(client, {
      messageId: "<reply-1@example.test>",
      inReplyTo: "<outbound@example.test>",
      references: [],
      from: "pessoa@example.test",
      to: ["pedro@rhcursos.com.br"],
      occurredAt: "2026-09-16T11:00:00.000Z",
      imapUid: "42",
      mailbox: "INBOX",
    });
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_event_type: "REPLIED",
      p_direction: "INBOUND",
      p_source: "IMAP",
      p_idempotency_key: "imap:reply-1@example.test",
      p_safe_summary: "Resposta recebida por e-mail.",
    });
    expect(JSON.stringify(rpc.mock.calls[0][1])).not.toContain("pessoa@example.test");
  });

  it("rejeita contrato IMAP com campos extras como body/html", () => {
    expect(() => normalizedImapEventSchema.parse({
      messageId: "reply-1",
      from: "pessoa@example.test",
      to: ["pedro@rhcursos.com.br"],
      occurredAt: "2026-09-16T11:00:00.000Z",
      imapUid: "42",
      mailbox: "INBOX",
      body: "conteúdo que não pode entrar no event store",
    })).toThrow();
  });

  it("mantém a idempotência do descadastro quando o mesmo token é repetido depois", async () => {
    const { client, rpc } = createClient();
    const base = {
      leadId: "lead-1",
      tokenId: "10000000-0000-4000-8000-000000000001",
    };

    await ingestUnsubscribeEvent(client, { ...base, occurredAt: "2026-09-16T12:00:00.000Z" });
    await ingestUnsubscribeEvent(client, { ...base, occurredAt: "2026-09-17T12:00:00.000Z" });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1].p_idempotency_key).toBe(`unsubscribe:${base.tokenId}`);
    expect(rpc.mock.calls[1][1].p_event_hash).toBe(rpc.mock.calls[0][1].p_event_hash);
  });
});
