import { z } from "zod";

import {
  LEAD_INTERACTION_TYPES,
  type LeadInteraction,
  type LeadInteractionType,
  type TimelineFilters,
} from "@/features/admin/leads/timeline/types";

export const LEAD_INTERACTION_LABELS: Record<LeadInteractionType, string> = {
  SENT: "Enviado",
  DELIVERED: "Entregue",
  OPENED: "Aberto",
  CLICKED: "Clicado",
  REPLIED: "Respondido",
  BOUNCED: "Bounce",
  COMPLAINED: "Reclamação",
  UNSUBSCRIBED: "Descadastro",
};

export const TERMINAL_INTERACTION_TYPES = new Set<LeadInteractionType>([
  "REPLIED",
  "BOUNCED",
  "COMPLAINED",
  "UNSUBSCRIBED",
]);

export const SUPPRESSION_INTERACTION_TYPES = new Set<LeadInteractionType>([
  "BOUNCED",
  "COMPLAINED",
  "UNSUBSCRIBED",
]);

export const safeMetadataSchema = z
  .object({
    campaign_id: z.string().max(120).optional(),
    sequence_id: z.string().uuid().optional(),
    step_index: z.number().int().min(0).max(100).optional(),
    link_url: z.string().url().max(500).optional(),
    bounce_type: z.string().max(80).optional(),
    bounce_subtype: z.string().max(120).optional(),
    diagnostic_code: z.string().max(240).optional(),
    mail_timestamp: z.string().datetime().optional(),
    imap_uid: z.string().max(120).optional(),
    mailbox: z.string().max(120).optional(),
    subject_hash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    request_id: z.string().max(120).optional(),
    provider: z.string().max(40).optional(),
  })
  .strict();

export const safeSummarySchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !/<[a-z][\s\S]*>/i.test(value), "Resumo não pode conter HTML.")
  .transform((value) => value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " "));

export function isTerminalInteraction(type: LeadInteractionType): boolean {
  return TERMINAL_INTERACTION_TYPES.has(type);
}

export function shouldSuppressLead(type: LeadInteractionType): boolean {
  return SUPPRESSION_INTERACTION_TYPES.has(type);
}

export function sortTimeline(events: LeadInteraction[]): LeadInteraction[] {
  return [...events].sort((left, right) => {
    const byOccurredAt = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    if (byOccurredAt !== 0) return byOccurredAt;
    return right.id.localeCompare(left.id);
  });
}

export function filterTimeline(events: LeadInteraction[], filters: TimelineFilters): LeadInteraction[] {
  const from = filters.from ? Date.parse(`${filters.from}T00:00:00.000Z`) : Number.NEGATIVE_INFINITY;
  const to = filters.to ? Date.parse(`${filters.to}T23:59:59.999Z`) : Number.POSITIVE_INFINITY;
  const selected = new Set(filters.types);

  return sortTimeline(
    events.filter((event) => {
      const occurredAt = Date.parse(event.occurredAt);
      return (!selected.size || selected.has(event.eventType)) && occurredAt >= from && occurredAt <= to;
    }),
  );
}

export function parseTimelineTypes(value: string | null): LeadInteractionType[] {
  if (!value) return [];
  const allowed = new Set<string>(LEAD_INTERACTION_TYPES);
  return Array.from(new Set(value.split(",").filter((item): item is LeadInteractionType => allowed.has(item))));
}
