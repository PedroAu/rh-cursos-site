import { describe, expect, it, vi } from "vitest";

import {
  getReactivationStatus,
  type SalesStatusDataSource,
} from "@/features/sales/reactivation/status";

const control = {
  enabled: false,
  dry_run: true,
  kill_switch: true,
  timezone: "America/Sao_Paulo",
  send_window_start: 8,
  send_window_end: 18,
  daily_limit: 25,
  batch_limit: 5,
  minimum_inactivity_days: 15,
  updated_at: "2026-09-18T12:00:00.000Z",
  updated_by: "migration",
};

const campaign = {
  campaign_key: "prospecting-v1",
  version: 1,
  status: "PAUSED",
  content_status: "APPROVED",
  policy_version: "prospecting-policy-v1",
  template_version: "prospecting-first-contact-v1",
};

const defaultMetrics = {
  campaign: { key: "prospecting-v1", version: 1, policyVersion: "policy-v1", templateVersion: "template-v1" },
  period: { from: "2026-08-22T12:00:00.000Z", to: "2026-09-21T12:00:00.000Z", timezone: "America/Sao_Paulo" },
  decisions: { eligible: 0, rejected: 0 },
  rejectedByReason: {},
  events: {},
  sentByStep: {},
  positiveReplies: null,
  positiveReplyClassificationCoverage: 0,
  interruptedSequences: 0,
  toolFailures: 0,
};

function createSource(options?: {
  pendingNotifications?: number;
  failedAttempts?: number;
  metrics?: Record<string, unknown>;
  campaign?: typeof campaign;
}): SalesStatusDataSource {
  const emptyCount = { data: null, count: 0, error: null };
  const selectedCampaign = options?.campaign ?? campaign;
  const selectedMetrics = options?.metrics ?? {
    ...defaultMetrics,
    campaign: {
      key: selectedCampaign.campaign_key,
      version: selectedCampaign.version,
      policyVersion: selectedCampaign.policy_version,
      templateVersion: selectedCampaign.template_version,
    },
  };
  return {
    kind: "sales-status-data-source",
    getControl: vi.fn(async () => ({ data: control, error: null })),
    getCampaign: vi.fn(async () => ({ data: selectedCampaign, error: null })),
    countPendingSteps: vi.fn(async () => emptyCount),
    countSentSteps: vi.fn(async () => emptyCount),
    countInterruptedSequences: vi.fn(async () => emptyCount),
    countFailedAttempts: vi.fn(async () => ({
      data: options?.failedAttempts ?? 0,
      error: null,
    })),
    countPendingNotifications: vi.fn(async () => ({
      data: options?.pendingNotifications ?? 0,
      error: null,
    })),
    getMetrics: vi.fn(async () => ({
      data: selectedMetrics,
      error: null,
    })),
  };
}

describe("getReactivationStatus", () => {
  it("expõe métricas agregadas de 30 dias e custo como faixa sem PII", async () => {
    const source = createSource({
      pendingNotifications: 3,
      metrics: {
        campaign: {
          key: "prospecting-v1",
          version: 1,
          policyVersion: "prospecting-policy-v1",
          templateVersion: "prospecting-first-contact-v1",
        },
        period: {
          from: "2026-08-19T12:00:00.000Z",
          to: "2026-09-18T12:00:00.000Z",
          timezone: "America/Sao_Paulo",
        },
        decisions: { eligible: 900, rejected: 100 },
        rejectedByReason: { SUPPRESSED: 20 },
        events: { SENT: 1_000, REPLIED: 25 },
        sentByStep: { 0: 700, 1: 250, 2: 50 },
        positiveReplies: null,
        positiveReplyClassificationCoverage: 0,
        interruptedSequences: 25,
        toolFailures: 2,
      },
    });
    const now = new Date("2026-09-18T12:00:00.000Z");

    const status = await getReactivationStatus(source, undefined, now);

    expect(source.getMetrics).toHaveBeenCalledWith(
      "prospecting-v1",
      "2026-08-19T12:00:00.000Z",
      "2026-09-18T12:00:00.000Z",
    );
    expect(source.countFailedAttempts).toHaveBeenCalledWith("prospecting-v1");
    expect(source.countPendingNotifications).toHaveBeenCalledWith("prospecting-v1");
    expect(status.counters.pendingNotifications).toBe(3);
    expect(status.metrics).toMatchObject({
      positiveReplies: null,
      positiveReplyClassificationCoverage: 0,
      costEstimate: {
        status: "RANGE_WITHOUT_ACCOUNT_PLAN",
        sent: 1_000,
        lowUsd: 0.1,
        highUsd: 0.23,
      },
    });
    expect(JSON.stringify(status)).not.toContain("pedro@rhcursos.com.br");
  });

  it("consulta alertas e métricas usando a campanha selecionada", async () => {
    const selectedCampaign = {
      ...campaign,
      campaign_key: "reactivation-v1",
      policy_version: "reactivation-policy-v1",
      template_version: "reactivation-template-v1",
    };
    const source = createSource({
      pendingNotifications: 7,
      campaign: selectedCampaign,
    });

    const status = await getReactivationStatus(
      source,
      "reactivation-v1",
      new Date("2026-09-21T12:00:00.000Z"),
    );

    expect(source.getCampaign).toHaveBeenCalledWith("reactivation-v1");
    expect(source.countPendingSteps).toHaveBeenCalledWith("reactivation-v1@%");
    expect(source.countSentSteps).toHaveBeenCalledWith("reactivation-v1@%");
    expect(source.countInterruptedSequences).toHaveBeenCalledWith("reactivation-v1@%");
    expect(source.countFailedAttempts).toHaveBeenCalledWith("reactivation-v1");
    expect(source.countPendingNotifications).toHaveBeenCalledWith("reactivation-v1");
    expect(source.getMetrics).toHaveBeenCalledWith(
      "reactivation-v1",
      "2026-08-22T12:00:00.000Z",
      "2026-09-21T12:00:00.000Z",
    );
    expect(status.campaign?.key).toBe("reactivation-v1");
    expect(status.counters.pendingNotifications).toBe(7);
  });

  it("rejeita métricas externas incompatíveis antes de montar o status", async () => {
    const source = createSource({ metrics: { ...defaultMetrics, events: null } });

    await expect(getReactivationStatus(source)).rejects.toThrow(
      "métricas: resposta inválida",
    );
  });

  it("rejeita toolFailures externo com tipo incompatível", async () => {
    const source = createSource({
      metrics: { ...defaultMetrics, toolFailures: "1" },
    });

    await expect(getReactivationStatus(source)).rejects.toThrow(
      "métricas: resposta inválida",
    );
  });

  it("aceita classificação positiva futura e ignora agregados aditivos desconhecidos", async () => {
    const source = createSource({
      metrics: {
        ...defaultMetrics,
        positiveReplies: 4,
        positiveReplyClassificationCoverage: 0.8,
        futureAggregate: { value: 1 },
      },
    });

    const status = await getReactivationStatus(source);

    expect(status.metrics.positiveReplies).toBe(4);
    expect(status.metrics.positiveReplyClassificationCoverage).toBe(0.8);
    expect(status.metrics).not.toHaveProperty("futureAggregate");
  });

  it("rejeita métricas sem o mapa obrigatório de eventos", async () => {
    const { events: _events, ...metricsWithoutEvents } = defaultMetrics;
    const source = createSource({ metrics: metricsWithoutEvents });

    await expect(getReactivationStatus(source)).rejects.toThrow(
      "métricas: resposta inválida",
    );
  });

  it("rejeita contagem negativa de alertas", async () => {
    const source = createSource({ pendingNotifications: -1 });

    await expect(getReactivationStatus(source)).rejects.toThrow(
      "alertas pendentes: resposta inválida",
    );
  });

  it("rejeita contador ausente em vez de reportar zero", async () => {
    const source = createSource();
    source.countFailedAttempts = vi.fn(async () => ({ data: null, error: null }));

    await expect(getReactivationStatus(source)).rejects.toThrow(
      "tentativas com falha: sem dados",
    );
  });

  it("rejeita wildcard na chave antes de consultar a fonte de dados", async () => {
    const source = createSource();

    await expect(getReactivationStatus(source, "prospecting-%"))
      .rejects.toThrow("campanha: chave inválida");
    expect(source.getCampaign).not.toHaveBeenCalled();
  });

  it("rejeita métricas pertencentes a outra campanha", async () => {
    const source = createSource({
      metrics: {
        ...defaultMetrics,
        campaign: { ...defaultMetrics.campaign, key: "reactivation-v1" },
      },
    });

    await expect(getReactivationStatus(source, "prospecting-v1"))
      .rejects.toThrow("métricas: campanha incompatível");
  });
});
