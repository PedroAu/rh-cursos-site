import { randomUUID } from "node:crypto";

import { evaluateReactivationEligibility } from "@/features/sales/reactivation/policy";
import { formatTelegramAlert } from "@/features/sales/reactivation/telegram";
import {
  PROSPECTING_TEMPLATE_VERSION,
  REACTIVATION_TEMPLATE_VERSION,
  isSupportedSalesCampaignTemplate,
  renderSalesCampaignTemplate,
} from "@/features/sales/reactivation/templates";
import {
  PROSPECTING_SUBJECTS,
  REACTIVATION_COURSES,
  type SalesCampaignSubject,
} from "@/features/sales/reactivation/types";
import { createUnsubscribeToken } from "@/lib/email/unsubscribe-token-core";

import { errorFields, log } from "./logging.js";
import type {
  CampaignRecord,
  CandidateRecord,
  DryRunSummary,
  EmailSender,
  OrchestratorConfig,
  OrchestratorSecret,
  SalesStore,
  StatusSnapshot,
  TelegramSender,
} from "./types.js";

const ACTOR_ID = "sales-reactivation-orchestrator";

function toPolicyCandidate(candidate: CandidateRecord) {
  return {
    leadId: candidate.leadId,
    deletedAt: candidate.deletedAt,
    email: candidate.email,
    permission: candidate.permissionStatus && candidate.permissionOccurredAt
      ? {
          status: candidate.permissionStatus,
          legalBasis: candidate.permissionLegalBasis,
          purpose: candidate.permissionPurpose ?? "",
          verifiedAt: candidate.permissionOccurredAt,
          expiresAt: candidate.permissionExpiresAt,
        }
      : null,
    suppressed: candidate.suppressed,
    hasActiveSequence: candidate.hasActiveSequence,
    hasCampaignSequence: candidate.hasCampaignSequence,
    lastInteractionAt: candidate.lastInteractionAt,
    minimumInactivityDays: candidate.minimumInactivityDays,
    course: candidate.course,
  };
}

function countReasons(summary: DryRunSummary, reasons: readonly string[]) {
  for (const reason of reasons) summary.reasonCounts[reason] = (summary.reasonCounts[reason] ?? 0) + 1;
}

function requireCampaign(campaign: CampaignRecord | null): CampaignRecord {
  if (!campaign) throw new Error("Campaign was not found.");
  if (!isSupportedSalesCampaignTemplate(campaign.templateVersion)) {
    throw new Error("Campaign template version does not match the worker bundle.");
  }
  const expectedTemplate = campaign.permissionPurpose === "COMMERCIAL_PROSPECTING"
    ? PROSPECTING_TEMPLATE_VERSION
    : REACTIVATION_TEMPLATE_VERSION;
  if (campaign.templateVersion !== expectedTemplate) {
    throw new Error("Campaign purpose does not match its template version.");
  }
  return campaign;
}

function asCourse(value: string, campaign: CampaignRecord): SalesCampaignSubject {
  const approvedSubjects = campaign.permissionPurpose === "COMMERCIAL_PROSPECTING"
    ? PROSPECTING_SUBJECTS
    : REACTIVATION_COURSES;
  const course = approvedSubjects.find((item) => item === value);
  if (!course) throw new Error("Claimed step references a course outside the approved campaign.");
  return course;
}

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0]?.slice(0, 80) || "Olá";
}

function unsubscribeUrl(secret: OrchestratorSecret, leadId: string, tokenId: string, now: Date): string {
  const token = createUnsubscribeToken({
    leadId,
    tokenId,
    expiresAt: Math.floor((now.getTime() + 365 * 24 * 60 * 60 * 1000) / 1000),
  }, secret.unsubscribeSecret);
  const url = new URL("/api/email/unsubscribe", secret.publicBaseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

function sendFailureStatus(error: unknown): "RETRYABLE_FAILED" | "PERMANENT_FAILED" | "AMBIGUOUS" {
  const value = error as { name?: string; $metadata?: { httpStatusCode?: number }; code?: string };
  const name = value?.name ?? "";
  const code = value?.code ?? "";
  const status = value?.$metadata?.httpStatusCode;
  if (["TimeoutError", "RequestTimeout", "ECONNRESET", "EPIPE"].includes(name) || ["ETIMEDOUT", "ECONNRESET", "EPIPE"].includes(code)) {
    return "AMBIGUOUS";
  }
  if (status && status >= 400 && status < 500 && ![408, 429].includes(status)) return "PERMANENT_FAILED";
  if (["MessageRejected", "MailFromDomainNotVerifiedException", "AccountSuspendedException"].includes(name)) return "PERMANENT_FAILED";
  return "RETRYABLE_FAILED";
}

export async function runDryRun(
  store: SalesStore,
  config: OrchestratorConfig,
  now = new Date(),
  runId = randomUUID(),
): Promise<DryRunSummary> {
  const status = await store.loadStatus(config.campaignKey, now);
  const campaign = requireCampaign(status.campaign);
  const summary: DryRunSummary = { runId, evaluated: 0, eligible: 0, rejected: 0, reasonCounts: {} };
  let offset = 0;

  while (true) {
    const candidates = await store.listCandidates(campaign.id, config.pageSize, offset);
    for (const candidate of candidates) {
      const decision = evaluateReactivationEligibility({
        candidate: toPolicyCandidate(candidate),
        campaign,
        control: { ...status.control, dryRun: true },
        now,
      });
      await store.recordDecision({ runId, campaign, candidate, decision, actorId: ACTOR_ID });
      summary.evaluated += 1;
      if (decision.eligible) summary.eligible += 1;
      else summary.rejected += 1;
      countReasons(summary, decision.reasonCodes);
    }
    if (candidates.length < config.pageSize) break;
    offset += candidates.length;
  }
  return summary;
}

async function discoverLiveSequences(
  store: SalesStore,
  config: OrchestratorConfig,
  status: StatusSnapshot,
  campaign: CampaignRecord,
  now: Date,
  runId: string,
) {
  if (!status.control.enabled || status.control.dryRun || status.control.killSwitch) throw new Error("Live automation is blocked by global controls.");
  if (campaign.status !== "ACTIVE" || campaign.contentStatus !== "APPROVED") throw new Error("Live campaign is not active and approved.");
  let offset = 0;
  let created = 0;
  while (true) {
    const candidates = await store.listCandidates(campaign.id, config.pageSize, offset);
    for (const candidate of candidates) {
      const decision = evaluateReactivationEligibility({ candidate: toPolicyCandidate(candidate), campaign, control: status.control, now });
      if (decision.eligible) {
        await store.createSequence({
          leadId: candidate.leadId,
          campaignId: campaign.id,
          runId,
          correlationId: `${runId}:${candidate.leadId}`,
          actorId: ACTOR_ID,
        });
        created += 1;
      } else {
        await store.recordDecision({ runId, campaign, candidate, decision, actorId: ACTOR_ID });
      }
    }
    if (candidates.length < config.pageSize) break;
    offset += candidates.length;
  }
  return { campaign, created };
}

async function deliverNotifications(
  store: SalesStore,
  telegram: TelegramSender,
  secret: OrchestratorSecret,
  config: OrchestratorConfig,
  now: Date,
) {
  const claimToken = randomUUID();
  const notifications = await store.claimNotifications(claimToken, now, config.leaseSeconds, config.batchLimit);
  let sent = 0;
  for (const notification of notifications) {
    try {
      const occurredAt = typeof notification.safePayload.occurred_at === "string"
        ? notification.safePayload.occurred_at
        : now.toISOString();
      const safeSummary = typeof notification.safePayload.safe_summary === "string"
        ? notification.safePayload.safe_summary
        : "Evento comercial requer atenção.";
      const crmUrl = new URL("/admin/leads", secret.publicBaseUrl);
      if (notification.leadId) crmUrl.searchParams.set("lead", notification.leadId);
      const text = formatTelegramAlert({
        kind: notification.kind,
        leadName: notification.leadName ?? "Contato não identificado",
        leadEmail: notification.leadEmail,
        occurredAt,
        safeSummary,
        crmUrl: crmUrl.toString(),
      });
      await telegram.send(text);
      await store.completeNotification(notification.notificationId, claimToken);
      sent += 1;
    } catch (error) {
      const retryable = !/HTTP 4\d\d/.test(error instanceof Error ? error.message : "");
      await store.failNotification(notification.notificationId, claimToken, error instanceof Error ? error.name : "UNKNOWN", retryable);
      log.warn("telegram notification failed", { notificationId: notification.notificationId, retryable, ...errorFields(error) });
    }
  }
  return sent;
}

export async function runLiveBatch(
  dependencies: { store: SalesStore; email: EmailSender; telegram: TelegramSender },
  config: OrchestratorConfig,
  secret: OrchestratorSecret,
  now = new Date(),
  runId = randomUUID(),
  options: { discover?: boolean } = {},
) {
  if (config.runMode !== "LIVE") throw new Error("Worker configuration is not in LIVE mode.");
  if (secret.telegramChatId !== config.allowedTelegramChatId) {
    throw new Error("Telegram destination is not in the deployment allowlist.");
  }
  await dependencies.email.assertProductionAccess();
  const status = await dependencies.store.loadStatus(config.campaignKey, now);
  const campaign = requireCampaign(status.campaign);
  const discovery = options.discover
    ? await discoverLiveSequences(dependencies.store, config, status, campaign, now, runId)
    : { created: 0 };
  const claimToken = randomUUID();
  const steps = await dependencies.store.claimSteps(
    config.campaignKey,
    claimToken,
    now,
    config.leaseSeconds,
    config.batchLimit,
  );
  let sent = 0;
  let failed = 0;

  for (const step of steps) {
    if (
      step.campaignId !== campaign.id
      || step.campaignKey !== campaign.campaignKey
      || step.campaignVersion !== campaign.version
    ) {
      await dependencies.store.failSend(
        step.attemptId,
        claimToken,
        "RETRYABLE_FAILED",
        "CAMPAIGN_VERSION_MISMATCH",
      );
      failed += 1;
      log.warn("claimed step campaign version mismatch", { attemptId: step.attemptId });
      continue;
    }
    let url: string;
    let rendered: ReturnType<typeof renderSalesCampaignTemplate>;
    try {
      url = unsubscribeUrl(secret, step.leadId, step.attemptId, now);
      rendered = renderSalesCampaignTemplate(campaign.templateVersion, step.stepIndex, {
        firstName: firstName(step.leadName),
        courseTitle: asCourse(step.courseTitle, campaign),
        unsubscribeUrl: url,
      });
    } catch (error) {
      await dependencies.store.failSend(
        step.attemptId,
        claimToken,
        "PERMANENT_FAILED",
        "INVALID_CLAIMED_PAYLOAD",
      );
      failed += 1;
      log.warn("claimed step payload rejected", { attemptId: step.attemptId, ...errorFields(error) });
      continue;
    }
    const correlationMessageId = `<attempt-${step.attemptId}@rhcursos.com.br>`;
    const canSend = await dependencies.store.beginSend(
      step.attemptId,
      claimToken,
      rendered.payloadHash,
      correlationMessageId,
      step.leadEmail,
      step.courseTitle,
    );
    if (!canSend) {
      await dependencies.store.failSend(step.attemptId, claimToken, "RETRYABLE_FAILED", "GUARDRAIL_REJECTED");
      failed += 1;
      continue;
    }

    let providerMessageId: string;
    try {
      const result = await dependencies.email.send({
        from: step.senderEmail,
        replyTo: step.replyToEmail,
        to: step.leadEmail,
        subject: rendered.subject,
        body: rendered.body,
        unsubscribeUrl: url,
        idempotencyKey: step.idempotencyKey,
        tags: {
          lead_id: step.leadId,
          sequence_id: step.sequenceId,
          sequence_step_id: step.sequenceStepId,
          campaign_id: step.campaignId,
          campaign_version: String(step.campaignVersion),
        },
      });
      providerMessageId = result.providerMessageId;
    } catch (error) {
      const failureStatus = sendFailureStatus(error);
      await dependencies.store.failSend(step.attemptId, claimToken, failureStatus, error instanceof Error ? error.name : "UNKNOWN");
      failed += 1;
      log.warn("ses send failed", { attemptId: step.attemptId, failureStatus, ...errorFields(error) });
      continue;
    }

    try {
      await dependencies.store.completeSend(step.attemptId, claimToken, providerMessageId, new Date());
      sent += 1;
    } catch (error) {
      try {
        await dependencies.store.failSend(step.attemptId, claimToken, "AMBIGUOUS", "PERSIST_AFTER_SES_FAILED");
      } catch (markError) {
        log.error("ambiguous send could not be persisted", { attemptId: step.attemptId, ...errorFields(markError) });
      }
      throw error;
    }
  }

  const notificationsSent = await deliverNotifications(dependencies.store, dependencies.telegram, secret, config, now);
  return { runId, created: discovery.created, claimed: steps.length, sent, failed, notificationsSent };
}

export const orchestratorInternals = { sendFailureStatus, unsubscribeUrl, toPolicyCandidate };
