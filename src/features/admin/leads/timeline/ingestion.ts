import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  safeMetadataSchema,
  safeSummarySchema,
} from "@/features/admin/leads/timeline/model";
import type { LeadInteractionType } from "@/features/admin/leads/timeline/types";
import type { Json } from "@/lib/supabase/database.types";

type AdminClient = SupabaseClient;

const sesMailSchema = z.object({
  messageId: z.string().trim().min(1).max(255),
  timestamp: z.string().datetime(),
  tags: z.record(z.string(), z.array(z.string())).optional().default({}),
});

const sesDetailSchema = z.object({
  eventType: z.enum(["Send", "Delivery", "Open", "Click", "Bounce", "Complaint"]),
  mail: sesMailSchema,
  send: z.object({ timestamp: z.string().datetime().optional() }).optional(),
  delivery: z.object({ timestamp: z.string().datetime().optional() }).optional(),
  open: z.object({ timestamp: z.string().datetime().optional() }).optional(),
  click: z.object({ timestamp: z.string().datetime().optional(), link: z.string().url().max(2048).optional() }).optional(),
  bounce: z.object({
    timestamp: z.string().datetime().optional(),
    bounceType: z.string().max(80).optional(),
    bounceSubType: z.string().max(120).optional(),
  }).optional(),
  complaint: z.object({ timestamp: z.string().datetime().optional() }).optional(),
}).superRefine((detail, context) => {
  if (detail.bounce && detail.eventType !== "Bounce") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bounce"],
      message: "bounce somente e permitido em eventos Bounce",
    });
  }
  if (detail.eventType === "Bounce" && !detail.bounce) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bounce"],
      message: "eventos Bounce exigem detalhes de bounce",
    });
  }
});

const sesEnvelopeSchema = z.union([
  sesDetailSchema,
  z.object({
    id: z.string().max(255).optional(),
    source: z.literal("aws.ses"),
    detail: sesDetailSchema,
  }),
]);

export const normalizedImapEventSchema = z
  .object({
    messageId: z.string().trim().min(1).max(255),
    inReplyTo: z.string().trim().max(255).optional(),
    references: z.array(z.string().trim().max(255)).max(30).optional().default([]),
    from: z.string().email().max(180),
    to: z.array(z.string().email().max(180)).min(1).max(20),
    occurredAt: z.string().datetime(),
    imapUid: z.string().trim().min(1).max(120),
    mailbox: z.string().trim().min(1).max(120).default("INBOX"),
    subjectHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  })
  .strict();

type MessageLink = {
  id: string;
  lead_id: string;
  sequence_id: string | null;
  provider_message_id: string;
  rfc_message_id: string | null;
};

type IngestParams = {
  leadId: string;
  messageId: string | null;
  sequenceId: string | null;
  externalEventId: string | null;
  eventType: LeadInteractionType;
  occurredAt: string;
  direction: "OUTBOUND" | "INBOUND";
  source: "SES" | "IMAP" | "CRM" | "INTERNAL";
  correlationId: string;
  causationId: string | null;
  actorId: string;
  actorVersion: string;
  safeSummary: string;
  contentRef: string | null;
  contentHash: string | null;
  metadata: Record<string, unknown>;
  idempotencyKey: string;
  eventHash: string;
};

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeMessageId(value: string): string {
  return value.trim().replace(/^<|>$/g, "").toLocaleLowerCase("en-US");
}

function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function firstTag(tags: Record<string, string[]>, name: string): string | undefined {
  return tags[name]?.[0]?.trim() || undefined;
}

function sanitizeTrackedLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`.slice(0, 500);
  } catch {
    return undefined;
  }
}

async function loadMessageLink(client: AdminClient, providerMessageId: string): Promise<MessageLink | null> {
  const { data, error } = await client
    .from("lead_email_message")
    .select("id,lead_id,sequence_id,provider_message_id,rfc_message_id")
    .eq("provider", "SES")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();
  if (error) throw new Error("Falha ao consultar correlação da mensagem.");
  return data;
}

async function registerSentMessage(
  client: AdminClient,
  providerMessageId: string,
  tags: Record<string, string[]>,
): Promise<MessageLink | null> {
  const leadId = firstTag(tags, "lead_id");
  if (!leadId) return null;

  const sequenceId = firstTag(tags, "sequence_id") ?? null;
  const sequenceStepId = firstTag(tags, "sequence_step_id") ?? null;
  const rfcMessageId = firstTag(tags, "rfc_message_id");

  const { data: lead, error: leadError } = await client
    .from("lead")
    .select("id")
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (leadError || !lead) return null;

  if (sequenceId) {
    const { data: sequence, error } = await client
      .from("lead_email_sequence")
      .select("id")
      .eq("id", sequenceId)
      .eq("lead_id", leadId)
      .maybeSingle();
    if (error || !sequence) return null;
  }
  if (sequenceStepId) {
    if (!sequenceId) return null;
    const { data: step, error } = await client
      .from("lead_email_sequence_step")
      .select("id")
      .eq("id", sequenceStepId)
      .eq("sequence_id", sequenceId)
      .maybeSingle();
    if (error || !step) return null;
  }

  const { error: insertError } = await client.from("lead_email_message").insert({
    lead_id: leadId,
    sequence_id: sequenceId,
    sequence_step_id: sequenceStepId,
    provider: "SES",
    provider_message_id: providerMessageId,
    rfc_message_id: rfcMessageId ? normalizeMessageId(rfcMessageId) : null,
  });
  if (insertError && insertError.code !== "23505") {
    throw new Error("Falha ao registrar correlação da mensagem.");
  }
  return loadMessageLink(client, providerMessageId);
}

async function persistInteraction(client: AdminClient, value: IngestParams) {
  const safeSummary = safeSummarySchema.parse(value.safeSummary);
  const metadata = safeMetadataSchema.parse(value.metadata);
  const { data, error } = await client.rpc("ingest_lead_interaction", {
    p_lead_id: value.leadId,
    p_message_id: value.messageId,
    p_sequence_id: value.sequenceId,
    p_external_event_id: value.externalEventId,
    p_event_type: value.eventType,
    p_occurred_at: value.occurredAt,
    p_direction: value.direction,
    p_source: value.source,
    p_correlation_id: value.correlationId,
    p_causation_id: value.causationId,
    p_actor_id: value.actorId,
    p_actor_version: value.actorVersion,
    p_safe_summary: safeSummary,
    p_content_ref: value.contentRef,
    p_content_hash: value.contentHash,
    p_metadata: metadata as Json,
    p_idempotency_key: value.idempotencyKey,
    p_event_hash: value.eventHash,
  });
  if (error || !data?.[0]) throw new Error("Falha ao persistir interação.");
  return data[0];
}

const SES_TYPE: Record<z.infer<typeof sesDetailSchema>["eventType"], LeadInteractionType> = {
  Send: "SENT",
  Delivery: "DELIVERED",
  Open: "OPENED",
  Click: "CLICKED",
  Bounce: "BOUNCED",
  Complaint: "COMPLAINED",
};

const SES_SUMMARY: Record<LeadInteractionType, string> = {
  SENT: "E-mail enviado pelo Amazon SES.",
  DELIVERED: "E-mail entregue ao servidor do destinatário.",
  OPENED: "Abertura do e-mail registrada.",
  CLICKED: "Clique em link do e-mail registrado.",
  REPLIED: "Resposta recebida por e-mail.",
  BOUNCED: "Falha de entrega registrada pelo Amazon SES.",
  COMPLAINED: "Reclamação de spam registrada pelo Amazon SES.",
  UNSUBSCRIBED: "Descadastro solicitado pelo contato.",
};

export async function ingestSesEvent(client: AdminClient, input: unknown) {
  const envelope = sesEnvelopeSchema.parse(input);
  const detail = "detail" in envelope ? envelope.detail : envelope;
  const envelopeId = "detail" in envelope ? envelope.id : undefined;
  const providerMessageId = detail.mail.messageId.trim();
  const eventType = SES_TYPE[detail.eventType];
  let link = await loadMessageLink(client, providerMessageId);
  if (!link && eventType === "SENT") {
    link = await registerSentMessage(client, providerMessageId, detail.mail.tags);
  }
  if (!link) throw new Error("Evento SES sem mensagem correlacionável.");

  const occurredAt =
    detail.send?.timestamp ?? detail.delivery?.timestamp ?? detail.open?.timestamp ??
    detail.click?.timestamp ?? detail.bounce?.timestamp ?? detail.complaint?.timestamp ?? detail.mail.timestamp;
  const trackedLink = sanitizeTrackedLink(detail.click?.link);
  const legacyEventFingerprint = {
    envelopeId: envelopeId ?? null,
    providerMessageId,
    eventType,
    occurredAt,
    trackedLink: trackedLink ?? null,
    bounceType: detail.bounce?.bounceType ?? null,
  };
  const eventFingerprint = {
    ...legacyEventFingerprint,
    ...(detail.bounce?.bounceSubType ? { bounceSubType: detail.bounce.bounceSubType } : {}),
  };
  const eventHash = hash(eventFingerprint);
  const externalEventId = envelopeId ?? hash(legacyEventFingerprint);

  return persistInteraction(client, {
    leadId: link.lead_id,
    messageId: link.id,
    sequenceId: link.sequence_id,
    externalEventId,
    eventType,
    occurredAt,
    direction: "OUTBOUND",
    source: "SES",
    correlationId: link.sequence_id ?? providerMessageId,
    causationId: providerMessageId,
    actorId: "amazon-ses",
    actorVersion: "eventbridge-v1",
    safeSummary: detail.eventType === "Bounce" && detail.bounce?.bounceSubType === "EmailValidationSuppressed"
      ? "Endereço bloqueado pela validação automática do Amazon SES."
      : SES_SUMMARY[eventType],
    contentRef: `ses://${encodeURIComponent(providerMessageId)}`,
    contentHash: null,
    metadata: {
      provider: "SES",
      mail_timestamp: detail.mail.timestamp,
      ...(trackedLink ? { link_url: trackedLink } : {}),
      ...(detail.bounce?.bounceType ? { bounce_type: detail.bounce.bounceType } : {}),
      ...(detail.bounce?.bounceSubType ? { bounce_subtype: detail.bounce.bounceSubType } : {}),
    },
    idempotencyKey: `ses:${externalEventId}`,
    eventHash,
  });
}

async function findImapCorrelation(
  client: AdminClient,
  input: z.infer<typeof normalizedImapEventSchema>,
): Promise<{ leadId: string; messageId: string | null; sequenceId: string | null; correlationId: string }> {
  const references = Array.from(
    new Set([input.inReplyTo, ...input.references].filter(Boolean).map((value) => normalizeMessageId(value!))),
  );

  if (references.length) {
    const { data, error } = await client
      .from("lead_email_message")
      .select("id,lead_id,sequence_id,provider_message_id,rfc_message_id")
      .in("rfc_message_id", references);
    if (error) throw new Error("Falha ao correlacionar referências IMAP.");
    const leadIds = new Set((data ?? []).map((row) => row.lead_id));
    if (leadIds.size > 1) throw new Error("Referências IMAP ambíguas.");
    if (data?.length) {
      const match = data[0];
      return {
        leadId: match.lead_id,
        messageId: match.id,
        sequenceId: match.sequence_id,
        correlationId: match.sequence_id ?? match.provider_message_id,
      };
    }
  }

  const sender = normalizeEmail(input.from);
  const { data: leads, error: leadError } = await client
    .from("lead")
    .select("id")
    .ilike("email", sender)
    .is("deleted_at", null)
    .limit(2);
  if (leadError || !leads || leads.length !== 1) throw new Error("Resposta IMAP sem lead correlacionável.");

  const { data: sequences, error: sequenceError } = await client
    .from("lead_email_sequence")
    .select("id")
    .eq("lead_id", leads[0].id)
    .eq("status", "ACTIVE")
    .limit(2);
  if (sequenceError || !sequences || sequences.length !== 1) {
    throw new Error("Resposta IMAP sem sequência ativa inequívoca.");
  }
  return { leadId: leads[0].id, messageId: null, sequenceId: sequences[0].id, correlationId: sequences[0].id };
}

export async function ingestImapEvent(client: AdminClient, raw: unknown) {
  const input = normalizedImapEventSchema.parse(raw);
  const correlation = await findImapCorrelation(client, input);
  const normalizedMessageId = normalizeMessageId(input.messageId);
  const eventFingerprint = {
    messageId: normalizedMessageId,
    leadId: correlation.leadId,
    occurredAt: input.occurredAt,
  };
  const eventHash = hash(eventFingerprint);

  return persistInteraction(client, {
    leadId: correlation.leadId,
    messageId: correlation.messageId,
    sequenceId: correlation.sequenceId,
    externalEventId: normalizedMessageId,
    eventType: "REPLIED",
    occurredAt: input.occurredAt,
    direction: "INBOUND",
    source: "IMAP",
    correlationId: correlation.correlationId,
    causationId: input.inReplyTo ? normalizeMessageId(input.inReplyTo) : null,
    actorId: "locaweb-imap-collector",
    actorVersion: "normalized-v1",
    safeSummary: SES_SUMMARY.REPLIED,
    contentRef: `imap://${encodeURIComponent(input.mailbox)}/${encodeURIComponent(input.imapUid)}`,
    contentHash: input.subjectHash ?? null,
    metadata: {
      provider: "LOCAWEB",
      imap_uid: input.imapUid,
      mailbox: input.mailbox,
      ...(input.subjectHash ? { subject_hash: input.subjectHash } : {}),
    },
    idempotencyKey: `imap:${normalizedMessageId}`,
    eventHash,
  });
}

export async function ingestUnsubscribeEvent(
  client: AdminClient,
  input: { leadId: string; tokenId: string; occurredAt: string },
) {
  const { data: sequenceRows, error } = await client
    .from("lead_email_sequence")
    .select("id")
    .eq("lead_id", input.leadId)
    .eq("status", "ACTIVE")
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw new Error("Falha ao consultar sequência ativa.");
  const sequenceId = sequenceRows?.[0]?.id ?? null;
  // O token identifica a solicitação. Repetições podem chegar em instantes
  // diferentes e ainda devem convergir para o mesmo evento idempotente.
  const eventHash = hash({
    leadId: input.leadId,
    tokenId: input.tokenId,
    eventType: "UNSUBSCRIBED",
  });
  return persistInteraction(client, {
    leadId: input.leadId,
    messageId: null,
    sequenceId,
    externalEventId: input.tokenId,
    eventType: "UNSUBSCRIBED",
    occurredAt: input.occurredAt,
    direction: "INBOUND",
    source: "CRM",
    correlationId: sequenceId ?? input.leadId,
    causationId: input.tokenId,
    actorId: "unsubscribe-endpoint",
    actorVersion: "v1",
    safeSummary: SES_SUMMARY.UNSUBSCRIBED,
    contentRef: null,
    contentHash: null,
    metadata: { provider: "CRM" },
    idempotencyKey: `unsubscribe:${input.tokenId}`,
    eventHash,
  });
}
