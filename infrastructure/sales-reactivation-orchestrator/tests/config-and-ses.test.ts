import { describe, expect, it } from "vitest";

import { loadConfig, parseSecret } from "../src/config.js";
import { orchestratorInternals } from "../src/orchestrator.js";
import { sesEmailInternals } from "../src/ses-email-sender.js";

describe("orchestrator configuration", () => {
  it("defaults to dry-run and conservative limits", () => {
    expect(loadConfig({ ORCHESTRATOR_SECRET_ARN: "arn:test" })).toMatchObject({
      runMode: "DRY_RUN",
      campaignKey: "reactivation-v1",
      pageSize: 250,
      batchLimit: 5,
      leaseSeconds: 120,
      allowedTelegramChatId: "0",
    });
  });

  it("rejects insecure endpoints and weak secrets", () => {
    expect(() => parseSecret(JSON.stringify({
      supabaseUrl: "http://example.test",
      supabaseServiceRoleKey: "short",
      unsubscribeSecret: "short",
      publicBaseUrl: "http://example.test",
      telegramBotToken: "short",
      telegramChatId: "private",
    }))).toThrow();
  });
});

describe("SES payload", () => {
  it("builds a safe MIME message with one-click unsubscribe", () => {
    const message = Buffer.from(sesEmailInternals.mimeMessage({
      from: "pedro@rhcursos.com.br",
      replyTo: "pedro@rhcursos.com.br",
      to: "ana@example.com",
      subject: "Atualização\r\nBcc: attacker@example.com",
      body: "Olá, Ana.",
      unsubscribeUrl: "https://www.rhcursos.com.br/api/email/unsubscribe?token=abc",
      idempotencyKey: "send:step:1",
      tags: {},
    })).toString("utf8");
    expect(message).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(message).toContain("X-RH-Attempt-ID: send:step:1");
    expect(message).not.toContain("\r\nBcc: attacker@example.com");
  });

  it("classifies uncertain transport failures as ambiguous", () => {
    expect(orchestratorInternals.sendFailureStatus(Object.assign(new Error("reset"), { code: "ECONNRESET" }))).toBe("AMBIGUOUS");
    expect(orchestratorInternals.sendFailureStatus(Object.assign(new Error("rejected"), { name: "MessageRejected" }))).toBe("PERMANENT_FAILED");
  });
});
