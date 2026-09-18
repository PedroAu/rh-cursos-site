import type { LeadInteractionType } from "@/features/admin/leads/timeline/types";
import type { ReactivationReasonCode } from "@/features/sales/reactivation/types";

export type ReactivationMetricInput = {
  decisions: Array<{ eligible: boolean; reasonCodes: ReactivationReasonCode[] }>;
  interactions: Array<{ eventType: LeadInteractionType }>;
  toolFailures: number;
  interruptedSequences?: number;
  positiveReplies?: number | null;
  positiveReplyClassificationCoverage?: number;
};

export const SES_BASE_COST_ASSUMPTIONS = Object.freeze({
  currency: "USD",
  lowPerThousand: 0.10,
  highPerThousand: 0.23,
  checkedAt: "2026-09-18",
  source: "https://aws.amazon.com/ses/pricing/",
  excludes: ["data transfer", "attachments", "VDM", "dedicated IPs", "Global Endpoints", "taxes"],
});

export function estimateSesBaseCost(sent: number) {
  const safeSent = Number.isFinite(sent) && sent > 0 ? Math.floor(sent) : 0;
  const roundUsd = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
  return {
    status: "RANGE_WITHOUT_ACCOUNT_PLAN" as const,
    sent: safeSent,
    lowUsd: roundUsd((safeSent * SES_BASE_COST_ASSUMPTIONS.lowPerThousand) / 1_000),
    highUsd: roundUsd((safeSent * SES_BASE_COST_ASSUMPTIONS.highPerThousand) / 1_000),
    ...SES_BASE_COST_ASSUMPTIONS,
  };
}

export function buildReactivationScorecard(input: ReactivationMetricInput) {
  const rejectedByReason = input.decisions
    .filter((decision) => !decision.eligible)
    .flatMap((decision) => decision.reasonCodes)
    .reduce<Record<string, number>>((counts, reason) => ({ ...counts, [reason]: (counts[reason] ?? 0) + 1 }), {});
  const events = input.interactions.reduce<Record<string, number>>(
    (counts, event) => ({ ...counts, [event.eventType]: (counts[event.eventType] ?? 0) + 1 }),
    {},
  );
  const sent = events.SENT ?? 0;
  return {
    eligible: input.decisions.filter((decision) => decision.eligible).length,
    rejected: input.decisions.filter((decision) => !decision.eligible).length,
    rejectedByReason,
    sent,
    delivered: events.DELIVERED ?? 0,
    opened: events.OPENED ?? 0,
    clicked: events.CLICKED ?? 0,
    replied: events.REPLIED ?? 0,
    bounced: events.BOUNCED ?? 0,
    complained: events.COMPLAINED ?? 0,
    unsubscribed: events.UNSUBSCRIBED ?? 0,
    interruptedSequences: input.interruptedSequences ?? 0,
    positiveReplies: input.positiveReplies ?? null,
    positiveReplyClassificationCoverage: input.positiveReplyClassificationCoverage ?? 0,
    toolFailures: input.toolFailures,
    costEstimate: estimateSesBaseCost(sent),
  };
}
