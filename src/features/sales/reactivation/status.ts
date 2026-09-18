import type { SupabaseClient } from "@supabase/supabase-js";

type QueryResult<T> = { data: T | null; count?: number | null; error: { message: string } | null };

function assertResult<T>(result: QueryResult<T>, operation: string): T {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${operation}: sem dados`);
  return result.data;
}

export async function getReactivationStatus(client: SupabaseClient, campaignKey = "reactivation-v1") {
  const [controlResult, campaignResult, pendingResult, sentResult, interruptedResult, failedResult, notificationResult] =
    await Promise.all([
      client.from("sales_orchestrator_control").select("*").eq("id", "global").single(),
      client.from("sales_reactivation_campaign").select("*").eq("campaign_key", campaignKey).order("version", { ascending: false }).limit(1).maybeSingle(),
      client.from("lead_email_sequence_step").select("id,lead_email_sequence!inner(campaign_key)", { count: "exact", head: true })
        .eq("status", "PENDING").like("lead_email_sequence.campaign_key", `${campaignKey}@%`),
      client.from("lead_email_sequence_step").select("id,lead_email_sequence!inner(campaign_key)", { count: "exact", head: true })
        .eq("status", "SENT").like("lead_email_sequence.campaign_key", `${campaignKey}@%`),
      client.from("lead_email_sequence").select("id", { count: "exact", head: true })
        .eq("status", "INTERRUPTED").like("campaign_key", `${campaignKey}@%`),
      client.from("sales_send_attempt").select("id", { count: "exact", head: true }).in("status", ["PERMANENT_FAILED", "AMBIGUOUS"]),
      client.from("sales_notification_outbox").select("id", { count: "exact", head: true }).in("status", ["PENDING", "FAILED"]),
    ]);

  const control = assertResult(controlResult as QueryResult<Record<string, unknown>>, "controle");
  if (campaignResult.error) throw new Error(`campanha: ${campaignResult.error.message}`);
  for (const [name, result] of [
    ["passos pendentes", pendingResult],
    ["passos enviados", sentResult],
    ["sequências interrompidas", interruptedResult],
    ["tentativas com falha", failedResult],
    ["alertas pendentes", notificationResult],
  ] as const) {
    if (result.error) throw new Error(`${name}: ${result.error.message}`);
  }

  const campaign = campaignResult.data as Record<string, unknown> | null;
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
      pendingSteps: pendingResult.count ?? 0,
      sentSteps: sentResult.count ?? 0,
      interruptedSequences: interruptedResult.count ?? 0,
      failedAttempts: failedResult.count ?? 0,
      pendingNotifications: notificationResult.count ?? 0,
    },
  };
}
