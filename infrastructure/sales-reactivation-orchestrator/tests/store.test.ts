import { describe, expect, it, vi } from "vitest";

import { SupabaseSalesStore } from "../src/store.js";
import type { OrchestratorSecret } from "../src/types.js";

const secret: OrchestratorSecret = {
  supabaseUrl: "https://project.supabase.co",
  supabaseServiceRoleKey: "service-role-key-long-enough",
  unsubscribeSecret: "u".repeat(32),
  sesEventsWebhookSecret: "s".repeat(32),
  publicBaseUrl: "https://www.rhcursos.com.br",
  telegramBotToken: "123456789:token-long-enough-value",
  telegramChatId: "123456789",
};

type AggregateResult = {
  data: number | null;
  error: { message: string } | null;
};

function createClient(options: {
  failedAttempts?: AggregateResult;
  pendingNotifications?: AggregateResult;
} = {}) {
  const from = vi.fn((table: string) => {
    if (table === "sales_orchestrator_control") {
      const result = {
        data: {
          enabled: false,
          dry_run: false,
          kill_switch: true,
          timezone: "America/Sao_Paulo",
          send_window_start: 8,
          send_window_end: 18,
          daily_limit: 25,
          batch_limit: 5,
          minimum_inactivity_days: 15,
        },
        error: null,
      };
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        single: vi.fn(async () => result),
      };
      return query;
    }

    if (table === "sales_reactivation_campaign") {
      const result = {
        data: {
          id: "342f1570-a939-4234-9093-2d3070765b7a",
          campaign_key: "prospecting-v1",
          version: 1,
          status: "PAUSED",
          content_status: "APPROVED",
          policy_version: "prospecting-policy-v1",
          template_version: "prospecting-v1-approved-1",
          permission_purpose: "COMMERCIAL_PROSPECTING",
          sender_email: "pedro@rhcursos.com.br",
          reply_to_email: "pedro@rhcursos.com.br",
        },
        error: null,
      };
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        maybeSingle: vi.fn(async () => result),
      };
      return query;
    }

    if (table === "lead_email_sequence_step") {
      let count = 0;
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((_column: string, status: string) => {
          count = status === "PENDING" ? 3_707 : 5;
          return query;
        }),
        like: vi.fn(async () => ({ data: null, count, error: null })),
      };
      return query;
    }

    if (table === "lead_email_sequence") {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        like: vi.fn(async () => ({ data: null, count: 1, error: null })),
      };
      return query;
    }

    if (table === "lead_interaction") {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        gte: vi.fn(async () => ({
          data: [{ occurred_at: "2026-09-21T10:00:00.000Z" }],
          error: null,
        })),
      };
      return query;
    }

    throw new Error(`unexpected table: ${table}`);
  });

  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    expect(args).toEqual({ p_campaign_key: "prospecting-v1" });
    if (name === "sales_campaign_failed_attempts") {
      return options.failedAttempts ?? { data: 2, error: null };
    }
    if (name === "sales_campaign_pending_notifications") {
      return options.pendingNotifications ?? { data: 3, error: null };
    }
    throw new Error(`unexpected rpc: ${name}`);
  });

  return { client: { from, rpc }, from, rpc };
}

describe("SupabaseSalesStore.loadStatus", () => {
  it("isola falhas e alertas pela campanha usando agregados service-role", async () => {
    const { client, from, rpc } = createClient();
    const store = new SupabaseSalesStore(secret, client as never);

    const status = await store.loadStatus(
      "prospecting-v1",
      new Date("2026-09-21T12:00:00.000Z"),
    );

    expect(status).toMatchObject({
      pendingSteps: 3_707,
      sentSteps: 5,
      interruptedSequences: 1,
      failedAttempts: 2,
      pendingNotifications: 3,
      control: { sentToday: 1 },
    });
    expect(rpc).toHaveBeenCalledWith("sales_campaign_failed_attempts", {
      p_campaign_key: "prospecting-v1",
    });
    expect(rpc).toHaveBeenCalledWith("sales_campaign_pending_notifications", {
      p_campaign_key: "prospecting-v1",
    });
    expect(from).not.toHaveBeenCalledWith("sales_send_attempt");
    expect(from).not.toHaveBeenCalledWith("sales_notification_outbox");
  });

  it.each([
    {
      label: "erro ao agregar falhas",
      options: { failedAttempts: { data: null, error: { message: "falha agregada" } } },
      message: "count failed attempts failed: falha agregada",
    },
    {
      label: "falhas sem dados",
      options: { failedAttempts: { data: null, error: null } },
      message: "count failed attempts returned no data",
    },
    {
      label: "erro ao agregar alertas",
      options: { pendingNotifications: { data: null, error: { message: "alerta indisponível" } } },
      message: "count pending notifications failed: alerta indisponível",
    },
    {
      label: "alertas sem dados",
      options: { pendingNotifications: { data: null, error: null } },
      message: "count pending notifications returned no data",
    },
    {
      label: "contagem negativa de falhas",
      options: { failedAttempts: { data: -1, error: null } },
      message: "count failed attempts returned an invalid count",
    },
  ])("falha fechado quando há $label", async ({ options, message }) => {
    const { client } = createClient(options);
    const store = new SupabaseSalesStore(secret, client as never);

    await expect(store.loadStatus(
      "prospecting-v1",
      new Date("2026-09-21T12:00:00.000Z"),
    )).rejects.toThrow(message);
  });
});
