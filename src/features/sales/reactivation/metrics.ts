import type { LeadInteractionType } from "@/features/admin/leads/timeline/types";
import type { ReactivationReasonCode } from "@/features/sales/reactivation/types";

export type ReactivationMetricInput = {
  decisions: Array<{ eligible: boolean; reasonCodes: ReactivationReasonCode[] }>;
  interactions: Array<{ eventType: LeadInteractionType }>;
  toolFailures: number;
};

export function buildReactivationScorecard(input: ReactivationMetricInput) {
  const rejectedByReason = input.decisions
    .filter((decision) => !decision.eligible)
    .flatMap((decision) => decision.reasonCodes)
    .reduce<Record<string, number>>((counts, reason) => ({ ...counts, [reason]: (counts[reason] ?? 0) + 1 }), {});
  const events = input.interactions.reduce<Record<string, number>>(
    (counts, event) => ({ ...counts, [event.eventType]: (counts[event.eventType] ?? 0) + 1 }),
    {},
  );
  return {
    eligible: input.decisions.filter((decision) => decision.eligible).length,
    rejected: input.decisions.filter((decision) => !decision.eligible).length,
    rejectedByReason,
    sent: events.SENT ?? 0,
    delivered: events.DELIVERED ?? 0,
    opened: events.OPENED ?? 0,
    clicked: events.CLICKED ?? 0,
    replied: events.REPLIED ?? 0,
    bounced: events.BOUNCED ?? 0,
    complained: events.COMPLAINED ?? 0,
    unsubscribed: events.UNSUBSCRIBED ?? 0,
    toolFailures: input.toolFailures,
  };
}
