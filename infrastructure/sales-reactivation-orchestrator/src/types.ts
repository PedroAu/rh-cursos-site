import type { EligibilityDecision, ReactivationCampaignState, ReactivationControl } from "@/features/sales/reactivation/types";

export type RunMode = "DRY_RUN" | "LIVE";

export type OrchestratorConfig = {
  secretArn: string;
  campaignKey: string;
  runMode: RunMode;
  pageSize: number;
  batchLimit: number;
  leaseSeconds: number;
  requestTimeoutMs: number;
  allowedTelegramChatId: string;
  sesConfigurationSet?: string;
};

export type OrchestratorSecret = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  unsubscribeSecret: string;
  publicBaseUrl: string;
  telegramBotToken: string;
  telegramChatId: string;
};

export type CampaignRecord = ReactivationCampaignState & {
  id: string;
  campaignKey: string;
  version: number;
  policyVersion: string;
  templateVersion: string;
  senderEmail: string;
  replyToEmail: string;
};

export type ControlRecord = ReactivationControl & {
  batchLimit: number;
  minimumInactivityDays: number;
};

export type CandidateRecord = {
  leadId: string;
  leadName: string;
  email: string | null;
  deletedAt: string | null;
  course: string | null;
  permissionStatus: "APPROVED" | "BLOCKED" | "UNKNOWN" | null;
  permissionLegalBasis: "CONSENT" | "LEGITIMATE_INTEREST" | "CONTRACT" | "OTHER" | null;
  permissionPurpose: string | null;
  permissionOccurredAt: string | null;
  permissionExpiresAt: string | null;
  suppressed: boolean;
  hasActiveSequence: boolean;
  hasCampaignSequence: boolean;
  lastInteractionAt: string | null;
  minimumInactivityDays: number;
};

export type ClaimedStep = {
  attemptId: string;
  sequenceStepId: string;
  sequenceId: string;
  leadId: string;
  leadName: string;
  leadEmail: string;
  campaignId: string;
  campaignKey: string;
  campaignVersion: number;
  stepIndex: number;
  senderEmail: string;
  replyToEmail: string;
  idempotencyKey: string;
  courseTitle: string;
};

export type ClaimedNotification = {
  notificationId: string;
  kind: "REPLIED" | "BOUNCED" | "COMPLAINED" | "UNSUBSCRIBED" | "PERMANENT_FAILURE" | "GUARDRAIL";
  leadId: string | null;
  leadName: string | null;
  leadEmail: string | null;
  safePayload: Record<string, unknown>;
};

export type StatusSnapshot = {
  campaign: CampaignRecord | null;
  control: ControlRecord;
  pendingSteps: number;
  sentSteps: number;
  interruptedSequences: number;
  failedAttempts: number;
  pendingNotifications: number;
};

export type DryRunSummary = {
  runId: string;
  evaluated: number;
  eligible: number;
  rejected: number;
  reasonCounts: Record<string, number>;
};

export interface SalesStore {
  loadStatus(campaignKey: string, now: Date): Promise<StatusSnapshot>;
  listCandidates(campaignId: string, limit: number, offset: number): Promise<CandidateRecord[]>;
  recordDecision(input: {
    runId: string;
    campaign: CampaignRecord;
    candidate: CandidateRecord;
    decision: EligibilityDecision;
    actorId: string;
  }): Promise<void>;
  createSequence(input: { leadId: string; campaignId: string; runId: string; correlationId: string; actorId: string }): Promise<string>;
  claimSteps(claimToken: string, now: Date, leaseSeconds: number, limit: number): Promise<ClaimedStep[]>;
  beginSend(attemptId: string, claimToken: string, payloadHash: string, rfcMessageId: string): Promise<boolean>;
  completeSend(attemptId: string, claimToken: string, providerMessageId: string, occurredAt: Date): Promise<void>;
  failSend(attemptId: string, claimToken: string, status: "RETRYABLE_FAILED" | "PERMANENT_FAILED" | "AMBIGUOUS", errorCode: string): Promise<void>;
  claimNotifications(claimToken: string, now: Date, leaseSeconds: number, limit: number): Promise<ClaimedNotification[]>;
  completeNotification(notificationId: string, claimToken: string): Promise<void>;
  failNotification(notificationId: string, claimToken: string, errorCode: string, retryable: boolean): Promise<void>;
  pause(actorId: string): Promise<void>;
  resume(actorId: string, approvalReference: string): Promise<void>;
}

export interface EmailSender {
  send(input: {
    from: string;
    replyTo: string;
    to: string;
    subject: string;
    body: string;
    unsubscribeUrl: string;
    idempotencyKey: string;
    tags: Record<string, string>;
  }): Promise<{ providerMessageId: string }>;
}

export interface TelegramSender {
  send(text: string): Promise<void>;
}
