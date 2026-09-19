import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseTimelineTypes } from "@/features/admin/leads/timeline/model";
import type { LeadInteraction, LeadInteractionType } from "@/features/admin/leads/timeline/types";

export type TimelineQuery = {
  types: LeadInteractionType[];
  from?: string;
  to?: string;
  limit: number;
};

function parseDate(value: string | null): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : value;
}

export function normalizeTimelineQuery(params: URLSearchParams): TimelineQuery {
  const requestedLimit = Number(params.get("limit") ?? 100);
  return {
    types: parseTimelineTypes(params.get("types")),
    from: parseDate(params.get("from")),
    to: parseDate(params.get("to")),
    limit: Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 100,
  };
}

export async function listLeadTimeline(
  client: SupabaseClient,
  leadId: string,
  filters: TimelineQuery,
): Promise<LeadInteraction[]> {
  let query = client
    .from("lead_interaction")
    .select(
      "id,lead_id,event_type,occurred_at,recorded_at,channel,direction,source,safe_summary,external_event_id,correlation_id,causation_id,actor_id,actor_version,content_ref,content_hash,metadata",
    )
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(filters.limit);

  if (filters.types.length) query = query.in("event_type", filters.types);
  if (filters.from) query = query.gte("occurred_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to) query = query.lte("occurred_at", `${filters.to}T23:59:59.999Z`);

  const { data, error } = await query;
  if (error) throw new Error("Falha ao consultar a linha do tempo.");

  return (data ?? []).map((row) => ({
    id: row.id,
    leadId: row.lead_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    channel: row.channel,
    direction: row.direction,
    source: row.source,
    safeSummary: row.safe_summary,
    externalEventId: row.external_event_id,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    actorId: row.actor_id,
    actorVersion: row.actor_version,
    contentRef: row.content_ref,
    contentHash: row.content_hash,
    metadata: typeof row.metadata === "object" && row.metadata !== null && !Array.isArray(row.metadata) ? row.metadata : {},
  }));
}
