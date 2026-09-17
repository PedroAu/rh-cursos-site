import { describe, expect, it } from "vitest";

import { createUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import { isValidWebhookSecret } from "@/lib/email/webhook-auth";

const secret = "timeline-test-secret-with-at-least-32-characters";

describe("email integration secrets", () => {
  it("compara webhook secret em tamanho fixo e falha fechado sem configuração", () => {
    expect(isValidWebhookSecret(secret, secret)).toBe(true);
    expect(isValidWebhookSecret(`${secret}x`, secret)).toBe(false);
    expect(isValidWebhookSecret(secret, undefined)).toBe(false);
    expect(isValidWebhookSecret("short", "short")).toBe(false);
  });

  it("assina, valida e rejeita adulteração/expiração do descadastro", () => {
    const payload = {
      leadId: "lead-1",
      tokenId: "10000000-0000-4000-8000-000000000001",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = createUnsubscribeToken(payload, secret);
    expect(verifyUnsubscribeToken(token, secret)).toEqual(payload);
    expect(verifyUnsubscribeToken(`${token}x`, secret)).toBeNull();
    expect(verifyUnsubscribeToken(token, secret, (payload.expiresAt + 1) * 1000)).toBeNull();
  });
});
