import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  CampaignRecord,
  CandidateRecord,
  ClaimedNotification,
  ClaimedStep,
  ControlRecord,
  OrchestratorSecret,
  SalesStore,
  StatusSnapshot,
} from "./types.js";

type QueryResult<T> = { data: T | null; error: { message: string } | null };

function dataOrThrow<T>(result: QueryResult<T>, operation: string): T {
  if (result.error) throw new Error(`${operation} failed: ${result.error.message}`);
  if (result.data === null) throw new Error(`${operation} returned no data.`);
  return result.data;
}

function snakeToCampaign(row: Record<string, unknown>): CampaignRecord {
  return {
    id: String(row.id),
    campaignKey: String(row.campaign_key),
    version: Number(row.version),
    status: row.status as CampaignRecord["status"],
    contentStatus: row.content_status as CampaignRecord["contentStatus"],
    policyVersion: String(row.policy_version),
    templateVersion: String(row.template_version),
    senderEmail: String(row.sender_email),
    replyToEmail: String(row.reply_to_email),
  };
}

function isSameLocalDate(left: Date, right: Date, timezone: string): boolean {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(left) === formatter.format(right);
}

export class SupabaseSalesStore implements SalesStore {
  private readonly client: SupabaseClient;

  constructor(secret: OrchestratorSecret) {
    this.client = createClient(secret.supabaseUrl, secret.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { "x-client-info": "rh-cursos-sales-reactivation/1.0" } },
    });
  }

  async loadStatus(campaignKey: string, now: Date): Promise<StatusSnapshot> {
    const [controlResult, campaignResult, pendingResult, sentResult, interruptedResult, failedResult, notificationResult, recentSentResult] =
      await Promise.all([
        this.client.from("sales_orchestrator_control").select("*").eq("id", "global").single(),
        this.client.from("sales_reactivation_campaign").select("*").eq("campaign_key", campaignKey).order("version", { ascending: false }).limit(1).maybeSingle(),
        this.client.from("lead_email_sequence_step").select("id,lead_email_sequence!inner(campaign_key)", { count: "exact", head: true })
          .eq("status", "PENDING").like("lead_email_sequence.campaign_key", `${campaignKey}@%`),
        this.client.from("lead_email_sequence_step").select("id,lead_email_sequence!inner(campaign_key)", { count: "exact", head: true })
          .eq("status", "SENT").like("lead_email_sequence.campaign_key", `${campaignKey}@%`),
        this.client.from("lead_email_sequence").select("id", { count: "exact", head: true })
          .eq("status", "INTERRUPTED").like("campaign_key", `${campaignKey}@%`),
        this.client.from("sales_send_attempt").select("id", { count: "exact", head: true }).in("status", ["PERMANENT_FAILED", "AMBIGUOUS"]),
        this.client.from("sales_notification_outbox").select("id", { count: "exact", head: true }).in("status", ["PENDING", "FAILED"]),
        this.client.from("lead_interaction").select("occurred_at").eq("event_type", "SENT").gte("occurred_at", new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()),
      ]);

    const controlRow = dataOrThrow(controlResult as QueryResult<Record<string, unknown>>, "load control");
    if (campaignResult.error) throw new Error(`load campaign failed: ${campaignResult.error.message}`);
    const campaignRow = campaignResult.data as Record<string, unknown> | null;
    const timezone = String(controlRow.timezone);
    const sentToday = dataOrThrow(recentSentResult as QueryResult<Array<{ occurred_at: string }>>, "load daily sends")
      .filter((row) => isSameLocalDate(new Date(row.occurred_at), now, timezone)).length;
    const control: ControlRecord = {
      enabled: Boolean(controlRow.enabled),
      dryRun: Boolean(controlRow.dry_run),
      killSwitch: Boolean(controlRow.kill_switch),
      timezone: "America/Sao_Paulo",
      sendWindowStart: Number(controlRow.send_window_start),
      sendWindowEnd: Number(controlRow.send_window_end),
      dailyLimit: Number(controlRow.daily_limit),
      sentToday,
      batchLimit: Number(controlRow.batch_limit),
      minimumInactivityDays: Number(controlRow.minimum_inactivity_days),
    };

    for (const [operation, result] of [
      ["count pending steps", pendingResult],
      ["count sent steps", sentResult],
      ["count interrupted sequences", interruptedResult],
      ["count failed attempts", failedResult],
      ["count pending notifications", notificationResult],
    ] as const) {
      if (result.error) throw new Error(`${operation} failed: ${result.error.message}`);
    }

    return {
      campaign: campaignRow ? snakeToCampaign(campaignRow) : null,
      control,
      pendingSteps: pendingResult.count ?? 0,
      sentSteps: sentResult.count ?? 0,
      interruptedSequences: interruptedResult.count ?? 0,
      failedAttempts: failedResult.count ?? 0,
      pendingNotifications: notificationResult.count ?? 0,
    };
  }

  async listCandidates(campaignId: string, limit: number, offset: number): Promise<CandidateRecord[]> {
    const result = await this.client.rpc("sales_list_reactivation_candidates", {
      p_campaign_id: campaignId,
      p_limit: limit,
      p_offset: offset,
    });
    const rows = dataOrThrow(result as QueryResult<Array<Record<string, unknown>>>, "list candidates");
    return rows.map((row) => ({
      leadId: String(row.lead_id),
      leadName: String(row.lead_name),
      email: row.lead_email ? String(row.lead_email) : null,
      deletedAt: row.deleted_at ? String(row.deleted_at) : null,
      course: row.course_title ? String(row.course_title) : null,
      permissionStatus: row.permission_status ? String(row.permission_status) as CandidateRecord["permissionStatus"] : null,
      permissionLegalBasis: row.permission_legal_basis ? String(row.permission_legal_basis) as CandidateRecord["permissionLegalBasis"] : null,
      permissionPurpose: row.permission_purpose ? String(row.permission_purpose) : null,
      permissionOccurredAt: row.permission_occurred_at ? String(row.permission_occurred_at) : null,
      permissionExpiresAt: row.permission_expires_at ? String(row.permission_expires_at) : null,
      suppressed: Boolean(row.suppressed),
      hasActiveSequence: Boolean(row.has_active_sequence),
      hasCampaignSequence: Boolean(row.has_campaign_sequence),
      lastInteractionAt: row.last_interaction_at ? String(row.last_interaction_at) : null,
      minimumInactivityDays: Number(row.minimum_inactivity_days),
    }));
  }

  async recordDecision(input: Parameters<SalesStore["recordDecision"]>[0]): Promise<void> {
    const result = await this.client.from("sales_reactivation_decision").upsert({
      lead_id: input.candidate.leadId,
      campaign_id: input.campaign.id,
      run_id: input.runId,
      decision: input.decision.eligible ? "ELIGIBLE" : "REJECTED",
      mode: input.decision.mode,
      reason_codes: input.decision.reasonCodes,
      policy_version: input.campaign.policyVersion,
      correlation_id: `${input.runId}:${input.candidate.leadId}`,
      actor_id: input.actorId,
      idempotency_key: `decision:${input.runId}:${input.campaign.id}:${input.candidate.leadId}`,
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (result.error) throw new Error(`record decision failed: ${result.error.message}`);
  }

  async createSequence(input: Parameters<SalesStore["createSequence"]>[0]): Promise<string> {
    const result = await this.client.rpc("sales_create_reactivation_sequence", {
      p_lead_id: input.leadId,
      p_campaign_id: input.campaignId,
      p_run_id: input.runId,
      p_correlation_id: input.correlationId,
      p_actor_id: input.actorId,
    });
    return String(dataOrThrow(result as QueryResult<string>, "create sequence"));
  }

  async claimSteps(claimToken: string, now: Date, leaseSeconds: number, limit: number): Promise<ClaimedStep[]> {
    const result = await this.client.rpc("sales_claim_reactivation_steps", {
      p_claim_token: claimToken,
      p_now: now.toISOString(),
      p_lease_seconds: leaseSeconds,
      p_limit: limit,
    });
    const rows = dataOrThrow(result as QueryResult<Array<Record<string, unknown>>>, "claim steps");
    return rows.map((row) => ({
      attemptId: String(row.attempt_id),
      sequenceStepId: String(row.sequence_step_id),
      sequenceId: String(row.sequence_id),
      leadId: String(row.lead_id),
      leadName: String(row.lead_name),
      leadEmail: String(row.lead_email),
      courseTitle: String(row.course_title),
      campaignId: String(row.campaign_id),
      campaignKey: String(row.campaign_key),
      campaignVersion: Number(row.campaign_version),
      stepIndex: Number(row.step_index),
      senderEmail: String(row.sender_email),
      replyToEmail: String(row.reply_to_email),
      idempotencyKey: String(row.idempotency_key),
    }));
  }

  async beginSend(attemptId: string, claimToken: string, payloadHash: string, rfcMessageId: string): Promise<boolean> {
    const result = await this.client.rpc("sales_begin_send", {
      p_attempt_id: attemptId,
      p_claim_token: claimToken,
      p_payload_hash: payloadHash,
      p_rfc_message_id: rfcMessageId,
    });
    return Boolean(dataOrThrow(result as QueryResult<boolean>, "begin send"));
  }

  async completeSend(attemptId: string, claimToken: string, providerMessageId: string, occurredAt: Date): Promise<void> {
    const result = await this.client.rpc("sales_complete_send", {
      p_attempt_id: attemptId,
      p_claim_token: claimToken,
      p_provider_message_id: providerMessageId,
      p_occurred_at: occurredAt.toISOString(),
    });
    dataOrThrow(result as QueryResult<string>, "complete send");
  }

  async failSend(attemptId: string, claimToken: string, status: "RETRYABLE_FAILED" | "PERMANENT_FAILED" | "AMBIGUOUS", errorCode: string): Promise<void> {
    const result = await this.client.rpc("sales_mark_send_failure", {
      p_attempt_id: attemptId,
      p_claim_token: claimToken,
      p_status: status,
      p_error_code: errorCode,
    });
    if (!dataOrThrow(result as QueryResult<boolean>, "mark send failure")) throw new Error("mark send failure was rejected");
  }

  async claimNotifications(claimToken: string, now: Date, leaseSeconds: number, limit: number): Promise<ClaimedNotification[]> {
    const result = await this.client.rpc("sales_claim_notifications", {
      p_claim_token: claimToken,
      p_now: now.toISOString(),
      p_lease_seconds: leaseSeconds,
      p_limit: limit,
    });
    const rows = dataOrThrow(result as QueryResult<Array<Record<string, unknown>>>, "claim notifications");
    return rows.map((row) => ({
      notificationId: String(row.notification_id),
      kind: String(row.kind) as ClaimedNotification["kind"],
      leadId: row.lead_id ? String(row.lead_id) : null,
      leadName: row.lead_name ? String(row.lead_name) : null,
      leadEmail: row.lead_email ? String(row.lead_email) : null,
      safePayload: (row.safe_payload ?? {}) as Record<string, unknown>,
    }));
  }

  async completeNotification(notificationId: string, claimToken: string): Promise<void> {
    const result = await this.client.rpc("sales_complete_notification", {
      p_notification_id: notificationId,
      p_claim_token: claimToken,
    });
    if (!dataOrThrow(result as QueryResult<boolean>, "complete notification")) throw new Error("complete notification was rejected");
  }

  async failNotification(notificationId: string, claimToken: string, errorCode: string, retryable: boolean): Promise<void> {
    const result = await this.client.rpc("sales_mark_notification_failure", {
      p_notification_id: notificationId,
      p_claim_token: claimToken,
      p_error_code: errorCode,
      p_retryable: retryable,
    });
    if (!dataOrThrow(result as QueryResult<boolean>, "fail notification")) throw new Error("fail notification was rejected");
  }

  async pause(actorId: string): Promise<void> {
    const result = await this.client.rpc("sales_set_orchestrator_state", {
      p_action: "PAUSE",
      p_actor_id: actorId,
      p_approval_reference: null,
      p_idempotency_key: `control:pause:${randomUUID()}`,
    });
    if (!dataOrThrow(result as QueryResult<boolean>, "pause")) throw new Error("pause was rejected");
  }

  async resume(actorId: string, approvalReference: string): Promise<void> {
    if (approvalReference.trim().length < 12) throw new Error("A production approval reference with at least 12 characters is required.");
    const result = await this.client.rpc("sales_set_orchestrator_state", {
      p_action: "RESUME",
      p_actor_id: actorId,
      p_approval_reference: approvalReference.trim(),
      p_idempotency_key: `control:resume:${randomUUID()}`,
    });
    if (!dataOrThrow(result as QueryResult<boolean>, "resume")) throw new Error("resume was rejected");
  }
}
