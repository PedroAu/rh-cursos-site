import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { estimateSesBaseCost } from "@/features/sales/reactivation/metrics";

export type SalesStatusQueryResult<T = unknown> = {
  data: T | null;
  count?: number | null;
  error: { message: string } | null;
};

export interface SalesStatusDataSource {
  kind: "sales-status-data-source";
  getControl(): Promise<SalesStatusQueryResult>;
  getCampaign(campaignKey: string): Promise<SalesStatusQueryResult>;
  countPendingSteps(sequencePattern: string): Promise<SalesStatusQueryResult>;
  countSentSteps(sequencePattern: string): Promise<SalesStatusQueryResult>;
  countInterruptedSequences(sequencePattern: string): Promise<SalesStatusQueryResult>;
  countFailedAttempts(campaignKey: string): Promise<SalesStatusQueryResult>;
  countPendingNotifications(campaignKey: string): Promise<SalesStatusQueryResult>;
  getMetrics(
    campaignKey: string,
    periodFrom: string,
    periodTo: string,
  ): Promise<SalesStatusQueryResult>;
}

function createSalesStatusDataSource(client: SupabaseClient): SalesStatusDataSource {
  return {
    kind: "sales-status-data-source",
    async getControl() {
      return client.from("sales_orchestrator_control").select("*").eq("id", "global").single();
    },
    async getCampaign(campaignKey) {
      return client.from("sales_reactivation_campaign").select("*")
        .eq("campaign_key", campaignKey).order("version", { ascending: false }).limit(1).maybeSingle();
    },
    async countPendingSteps(sequencePattern) {
      return client.from("lead_email_sequence_step")
        .select("id,lead_email_sequence!inner(campaign_key)", { count: "exact", head: true })
        .eq("status", "PENDING").like("lead_email_sequence.campaign_key", sequencePattern);
    },
    async countSentSteps(sequencePattern) {
      return client.from("lead_email_sequence_step")
        .select("id,lead_email_sequence!inner(campaign_key)", { count: "exact", head: true })
        .eq("status", "SENT").like("lead_email_sequence.campaign_key", sequencePattern);
    },
    async countInterruptedSequences(sequencePattern) {
      return client.from("lead_email_sequence").select("id", { count: "exact", head: true })
        .eq("status", "INTERRUPTED").like("campaign_key", sequencePattern);
    },
    async countFailedAttempts(campaignKey) {
      return client.rpc("sales_campaign_failed_attempts", { p_campaign_key: campaignKey });
    },
    async countPendingNotifications(campaignKey) {
      return client.rpc("sales_campaign_pending_notifications", { p_campaign_key: campaignKey });
    },
    async getMetrics(campaignKey, periodFrom, periodTo) {
      return client.rpc("sales_reactivation_metrics", {
        p_campaign_key: campaignKey,
        p_from: periodFrom,
        p_to: periodTo,
      });
    },
  };
}

function isSalesStatusDataSource(
  value: SupabaseClient | SalesStatusDataSource,
): value is SalesStatusDataSource {
  return "kind" in value && value.kind === "sales-status-data-source";
}

export const DEFAULT_SALES_CAMPAIGN_KEY = "prospecting-v1";
export const salesCampaignKeySchema = z.string()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9-]+$/);

const controlSchema = z.object({
  enabled: z.boolean(),
  dry_run: z.boolean(),
  kill_switch: z.boolean(),
  timezone: z.string(),
  send_window_start: z.number(),
  send_window_end: z.number(),
  daily_limit: z.number(),
  batch_limit: z.number(),
  minimum_inactivity_days: z.number(),
  updated_at: z.string(),
  updated_by: z.string(),
});

const campaignSchema = z.object({
  campaign_key: z.string(),
  version: z.number().int().positive(),
  status: z.string(),
  content_status: z.string(),
  policy_version: z.string(),
  template_version: z.string(),
});

const metricsSchema = z.object({
  campaign: z.object({
    key: z.string(),
    version: z.number().int().positive(),
    policyVersion: z.string(),
    templateVersion: z.string(),
  }),
  period: z.object({
    from: z.string(),
    to: z.string(),
    timezone: z.string(),
  }),
  decisions: z.object({
    eligible: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  }),
  rejectedByReason: z.record(z.string(), z.number().int().nonnegative()),
  events: z.record(z.string(), z.number().int().nonnegative()),
  sentByStep: z.record(z.string(), z.number().int().nonnegative()),
  positiveReplies: z.number().int().nonnegative().nullable(),
  positiveReplyClassificationCoverage: z.number().min(0).max(1),
  interruptedSequences: z.number().int().nonnegative(),
  toolFailures: z.number().int().nonnegative(),
});

function parseResult<T>(
  result: SalesStatusQueryResult,
  schema: z.ZodType<T>,
  operation: string,
): T {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${operation}: sem dados`);
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    }).join("; ");
    throw new Error(`${operation}: resposta inválida (${issues})`);
  }
  return parsed.data;
}

function readCount(result: SalesStatusQueryResult, operation: string): number {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  if (result.count === null || result.count === undefined) {
    throw new Error(`${operation}: contagem ausente`);
  }
  if (!Number.isSafeInteger(result.count) || result.count < 0) {
    throw new Error(`${operation}: contagem inválida`);
  }
  return result.count;
}

export async function getReactivationStatus(
  clientOrSource: SupabaseClient | SalesStatusDataSource,
  campaignKey = DEFAULT_SALES_CAMPAIGN_KEY,
  now = new Date(),
) {
  const parsedCampaignKey = salesCampaignKeySchema.safeParse(campaignKey);
  if (!parsedCampaignKey.success) throw new Error("campanha: chave inválida");
  const selectedCampaignKey = parsedCampaignKey.data;
  const periodTo = now.toISOString();
  const periodFrom = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const campaignSequencePattern = `${selectedCampaignKey}@%`;
  const source = isSalesStatusDataSource(clientOrSource)
    ? clientOrSource
    : createSalesStatusDataSource(clientOrSource);
  const [controlResult, campaignResult, pendingResult, sentResult, interruptedResult, failedResult, notificationResult, metricsResult] =
    await Promise.all([
      source.getControl(),
      source.getCampaign(selectedCampaignKey),
      source.countPendingSteps(campaignSequencePattern),
      source.countSentSteps(campaignSequencePattern),
      source.countInterruptedSequences(campaignSequencePattern),
      source.countFailedAttempts(selectedCampaignKey),
      source.countPendingNotifications(selectedCampaignKey),
      source.getMetrics(selectedCampaignKey, periodFrom, periodTo),
    ]);

  const control = parseResult(controlResult, controlSchema, "controle");
  if (campaignResult.error) throw new Error(`campanha: ${campaignResult.error.message}`);
  const campaign = campaignResult.data === null
    ? null
    : parseResult(campaignResult, campaignSchema, "campanha");
  const aggregateMetrics = parseResult(metricsResult, metricsSchema, "métricas");
  if (
    aggregateMetrics.campaign.key !== selectedCampaignKey
    || (campaign !== null && aggregateMetrics.campaign.version !== campaign.version)
  ) {
    throw new Error("métricas: campanha incompatível");
  }
  const pendingNotifications = parseResult(
    notificationResult,
    z.number().int().nonnegative(),
    "alertas pendentes",
  );
  const eventCounts = aggregateMetrics.events;
  const sentInPeriod = Number(eventCounts?.SENT ?? 0);
  return {
    campaign: campaign ? {
      key: campaign.campaign_key,
      version: campaign.version,
      status: campaign.status,
      contentStatus: campaign.content_status,
      policyVersion: campaign.policy_version,
      templateVersion: campaign.template_version,
    } : null,
    control: {
      enabled: control.enabled,
      dryRun: control.dry_run,
      killSwitch: control.kill_switch,
      timezone: control.timezone,
      sendWindowStart: control.send_window_start,
      sendWindowEnd: control.send_window_end,
      dailyLimit: control.daily_limit,
      batchLimit: control.batch_limit,
      minimumInactivityDays: control.minimum_inactivity_days,
      updatedAt: control.updated_at,
      updatedBy: control.updated_by,
    },
    counters: {
      pendingSteps: readCount(pendingResult, "passos pendentes"),
      sentSteps: readCount(sentResult, "passos enviados"),
      interruptedSequences: readCount(interruptedResult, "sequências interrompidas"),
      failedAttempts: parseResult(
        failedResult,
        z.number().int().nonnegative(),
        "tentativas com falha",
      ),
      pendingNotifications,
    },
    metrics: {
      ...aggregateMetrics,
      costEstimate: estimateSesBaseCost(sentInPeriod),
    },
  };
}
