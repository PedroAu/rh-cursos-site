export const LEAD_INTERACTION_TYPES = [
  "SENT",
  "DELIVERED",
  "OPENED",
  "CLICKED",
  "REPLIED",
  "BOUNCED",
  "COMPLAINED",
  "UNSUBSCRIBED",
] as const;

export type LeadInteractionType = (typeof LEAD_INTERACTION_TYPES)[number];
export type LeadInteractionDirection = "OUTBOUND" | "INBOUND";
export type LeadInteractionSource = "SES" | "IMAP" | "CRM" | "INTERNAL";

export type LeadInteraction = {
  id: string;
  leadId: string;
  eventType: LeadInteractionType;
  occurredAt: string;
  recordedAt: string;
  channel: "EMAIL";
  direction: LeadInteractionDirection;
  source: LeadInteractionSource;
  safeSummary: string;
  externalEventId: string | null;
  correlationId: string;
  causationId: string | null;
  actorId: string;
  actorVersion: string;
  contentRef: string | null;
  contentHash: string | null;
  metadata: Record<string, unknown>;
};

export type TimelineFilters = {
  types: LeadInteractionType[];
  from?: string;
  to?: string;
};
