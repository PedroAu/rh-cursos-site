import { describe, expect, it, vi } from "vitest";

import { runDryRun, runLiveBatch } from "../src/orchestrator.js";
import type {
  CampaignRecord,
  CandidateRecord,
  ClaimedNotification,
  ClaimedStep,
  ControlRecord,
  EmailSender,
  OrchestratorConfig,
  OrchestratorSecret,
  SalesStore,
  StatusSnapshot,
  TelegramSender,
} from "../src/types.js";

const campaign: CampaignRecord = {
  id: "10000000-0000-0000-0000-000000000001",
  campaignKey: "reactivation-v1",
  version: 1,
  status: "ACTIVE",
  contentStatus: "APPROVED",
  policyVersion: "reactivation-policy-v1",
  templateVersion: "reactivation-v1-draft-1",
  senderEmail: "pedro@rhcursos.com.br",
  replyToEmail: "pedro@rhcursos.com.br",
};
const control: ControlRecord = {
  enabled: true,
  dryRun: false,
  killSwitch: false,
  timezone: "America/Sao_Paulo",
  sendWindowStart: 8,
  sendWindowEnd: 18,
  dailyLimit: 25,
  sentToday: 0,
  batchLimit: 5,
  minimumInactivityDays: 15,
};
const candidate: CandidateRecord = {
  leadId: "lead-1",
  leadName: "Ana Silva",
  email: "ana@example.com",
  deletedAt: null,
  course: "Auditoria da Folha de Pagamento",
  permissionStatus: "APPROVED",
  permissionLegalBasis: "CONSENT",
  permissionPurpose: "COMMERCIAL_REACTIVATION",
  permissionOccurredAt: "2026-08-01T00:00:00.000Z",
  permissionExpiresAt: null,
  suppressed: false,
  hasActiveSequence: false,
  hasCampaignSequence: false,
  lastInteractionAt: "2026-08-01T00:00:00.000Z",
  minimumInactivityDays: 15,
};
const step: ClaimedStep = {
  attemptId: "20000000-0000-4000-8000-000000000002",
  sequenceStepId: "30000000-0000-0000-0000-000000000003",
  sequenceId: "40000000-0000-0000-0000-000000000004",
  leadId: candidate.leadId,
  leadName: candidate.leadName,
  leadEmail: candidate.email ?? "",
  courseTitle: candidate.course ?? "",
  campaignId: campaign.id,
  campaignKey: campaign.campaignKey,
  campaignVersion: 1,
  stepIndex: 0,
  senderEmail: campaign.senderEmail,
  replyToEmail: campaign.replyToEmail,
  idempotencyKey: "send:step:1",
};
const notification: ClaimedNotification = {
  notificationId: "50000000-0000-0000-0000-000000000005",
  kind: "REPLIED",
  leadId: candidate.leadId,
  leadName: candidate.leadName,
  leadEmail: candidate.email,
  safePayload: { occurred_at: "2026-09-18T13:00:00.000Z", safe_summary: "Resposta recebida." },
};
const config: OrchestratorConfig = {
  secretArn: "arn:test",
  campaignKey: "reactivation-v1",
  runMode: "LIVE",
  pageSize: 250,
  batchLimit: 5,
  leaseSeconds: 120,
  requestTimeoutMs: 8000,
  allowedTelegramChatId: "-1001234567890",
};
const secret: OrchestratorSecret = {
  supabaseUrl: "https://example.supabase.co",
  supabaseServiceRoleKey: "service-role-key-long-enough",
  unsubscribeSecret: "a".repeat(32),
  sesEventsWebhookSecret: "b".repeat(32),
  publicBaseUrl: "https://www.rhcursos.com.br",
  telegramBotToken: "123456789:token-long-enough-value",
  telegramChatId: "-1001234567890",
};

function fakeStore(overrides: Partial<SalesStore> = {}): SalesStore {
  const status: StatusSnapshot = {
    campaign,
    control,
    pendingSteps: 1,
    sentSteps: 0,
    interruptedSequences: 0,
    failedAttempts: 0,
    pendingNotifications: 1,
  };
  return {
    loadStatus: vi.fn().mockResolvedValue(status),
    listCandidates: vi.fn().mockResolvedValueOnce([candidate]).mockResolvedValueOnce([]),
    recordDecision: vi.fn().mockResolvedValue(undefined),
    createSequence: vi.fn().mockResolvedValue(step.sequenceId),
    claimSteps: vi.fn().mockResolvedValue([step]),
    beginSend: vi.fn().mockResolvedValue(true),
    completeSend: vi.fn().mockResolvedValue(undefined),
    failSend: vi.fn().mockResolvedValue(undefined),
    claimNotifications: vi.fn().mockResolvedValue([notification]),
    completeNotification: vi.fn().mockResolvedValue(undefined),
    failNotification: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("sales orchestrator", () => {
  it("persists a dry-run decision without creating sequences or calling providers", async () => {
    const store = fakeStore({ claimSteps: vi.fn().mockResolvedValue([]) });
    const result = await runDryRun(store, { ...config, runMode: "DRY_RUN" }, new Date("2026-09-18T13:00:00.000Z"));
    expect(result).toMatchObject({ evaluated: 1, eligible: 1, rejected: 0 });
    expect(store.recordDecision).toHaveBeenCalledOnce();
    expect(store.createSequence).not.toHaveBeenCalled();
  });

  it("creates, sends, persists and notifies only in explicit live mode", async () => {
    const store = fakeStore();
    const email: EmailSender = { send: vi.fn().mockResolvedValue({ providerMessageId: "ses-message-1" }) };
    const telegram: TelegramSender = { send: vi.fn().mockResolvedValue(undefined) };
    const result = await runLiveBatch(
      { store, email, telegram },
      config,
      secret,
      new Date("2026-09-18T13:00:00.000Z"),
      undefined,
      { discover: true },
    );
    expect(result).toMatchObject({ created: 1, claimed: 1, sent: 1, failed: 0, notificationsSent: 1 });
    expect(store.beginSend).toHaveBeenCalledWith(
      step.attemptId,
      expect.any(String),
      expect.any(String),
      expect.any(String),
      step.leadEmail,
      step.courseTitle,
    );
    expect(email.send).toHaveBeenCalledOnce();
    expect(store.completeSend).toHaveBeenCalledWith(step.attemptId, expect.any(String), "ses-message-1", expect.any(Date));
    expect(telegram.send).toHaveBeenCalledOnce();
  });

  it("does not discover new contacts during a scheduled live batch", async () => {
    const store = fakeStore({ claimSteps: vi.fn().mockResolvedValue([]), claimNotifications: vi.fn().mockResolvedValue([]) });
    const email: EmailSender = { send: vi.fn() };
    const telegram: TelegramSender = { send: vi.fn() };
    const result = await runLiveBatch({ store, email, telegram }, config, secret, new Date("2026-09-18T13:00:00.000Z"));
    expect(result).toMatchObject({ created: 0, claimed: 0, sent: 0 });
    expect(store.listCandidates).not.toHaveBeenCalled();
    expect(store.createSequence).not.toHaveBeenCalled();
  });

  it("never sends when begin-send loses the guardrail race", async () => {
    const store = fakeStore({ beginSend: vi.fn().mockResolvedValue(false), claimNotifications: vi.fn().mockResolvedValue([]) });
    const email: EmailSender = { send: vi.fn() };
    const telegram: TelegramSender = { send: vi.fn() };
    const result = await runLiveBatch({ store, email, telegram }, config, secret, new Date("2026-09-18T13:00:00.000Z"));
    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(email.send).not.toHaveBeenCalled();
    expect(store.failSend).toHaveBeenCalledWith(step.attemptId, expect.any(String), "RETRYABLE_FAILED", "GUARDRAIL_REJECTED");
  });

  it("permanently rejects a claimed course outside the approved campaign", async () => {
    const store = fakeStore({
      claimSteps: vi.fn().mockResolvedValue([{ ...step, courseTitle: "Curso adulterado" }]),
      claimNotifications: vi.fn().mockResolvedValue([]),
    });
    const email: EmailSender = { send: vi.fn() };
    const telegram: TelegramSender = { send: vi.fn() };

    const result = await runLiveBatch(
      { store, email, telegram },
      config,
      secret,
      new Date("2026-09-18T13:00:00.000Z"),
    );

    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(email.send).not.toHaveBeenCalled();
    expect(store.beginSend).not.toHaveBeenCalled();
    expect(store.failSend).toHaveBeenCalledWith(
      step.attemptId,
      expect.any(String),
      "PERMANENT_FAILED",
      "INVALID_CLAIMED_PAYLOAD",
    );
  });

  it("blocks live mode when the private Telegram chat is not allowlisted", async () => {
    const store = fakeStore();
    const email: EmailSender = { send: vi.fn() };
    const telegram: TelegramSender = { send: vi.fn() };
    await expect(runLiveBatch(
      { store, email, telegram },
      { ...config, allowedTelegramChatId: "-1009999999999" },
      secret,
      new Date("2026-09-18T13:00:00.000Z"),
    )).rejects.toThrow("allowlist");
    expect(store.loadStatus).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it("marks a post-SES persistence failure as ambiguous", async () => {
    const store = fakeStore({
      completeSend: vi.fn().mockRejectedValue(new Error("database unavailable")),
      claimNotifications: vi.fn().mockResolvedValue([]),
    });
    const email: EmailSender = { send: vi.fn().mockResolvedValue({ providerMessageId: "ses-message-1" }) };
    const telegram: TelegramSender = { send: vi.fn() };
    await expect(runLiveBatch({ store, email, telegram }, config, secret, new Date("2026-09-18T13:00:00.000Z"))).rejects.toThrow("database unavailable");
    expect(store.failSend).toHaveBeenCalledWith(step.attemptId, expect.any(String), "AMBIGUOUS", "PERSIST_AFTER_SES_FAILED");
  });
});
