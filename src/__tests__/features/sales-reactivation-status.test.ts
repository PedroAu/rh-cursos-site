import { describe, expect, it, vi } from "vitest";

import { getReactivationStatus } from "@/features/sales/reactivation/status";

type QueryResult = { data: unknown; count?: number; error: null };

function query(result: QueryResult) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    like: vi.fn(async () => result),
    in: vi.fn(async () => result),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  };
  return builder;
}

describe("getReactivationStatus", () => {
  it("expõe métricas agregadas de 30 dias e custo como faixa sem PII", async () => {
    const control = query({
      data: {
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
      },
      error: null,
    });
    const campaign = query({
      data: {
        campaign_key: "reactivation-v1",
        version: 1,
        status: "DISABLED",
        content_status: "DRAFT",
        policy_version: "reactivation-policy-v1",
        template_version: "reactivation-v1-draft-1",
      },
      error: null,
    });
    const counted = query({ data: [], count: 0, error: null });
    const rpc = vi.fn().mockResolvedValue({
      data: {
        campaign: { key: "reactivation-v1", version: 1 },
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
      error: null,
    });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "sales_orchestrator_control") return control;
        if (table === "sales_reactivation_campaign") return campaign;
        return counted;
      }),
      rpc,
    };
    const now = new Date("2026-09-18T12:00:00.000Z");

    const status = await getReactivationStatus(client as never, "reactivation-v1", now);

    expect(rpc).toHaveBeenCalledWith("sales_reactivation_metrics", {
      p_campaign_key: "reactivation-v1",
      p_from: "2026-08-19T12:00:00.000Z",
      p_to: "2026-09-18T12:00:00.000Z",
    });
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
});
