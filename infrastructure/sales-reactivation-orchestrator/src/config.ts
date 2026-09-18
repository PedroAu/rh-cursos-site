import { z } from "zod";

import type { OrchestratorConfig, OrchestratorSecret } from "./types.js";

const positiveInteger = (fallback: number, maximum: number) =>
  z.coerce.number().int().positive().max(maximum).default(fallback);

const envSchema = z.object({
  ORCHESTRATOR_SECRET_ARN: z.string().trim().min(1),
  CAMPAIGN_KEY: z.string().trim().min(1).max(120).default("reactivation-v1"),
  RUN_MODE: z.enum(["DRY_RUN", "LIVE"]).default("DRY_RUN"),
  CANDIDATE_PAGE_SIZE: positiveInteger(250, 500),
  SEND_BATCH_LIMIT: positiveInteger(5, 50),
  CLAIM_LEASE_SECONDS: positiveInteger(120, 900),
  EXTERNAL_REQUEST_TIMEOUT_MS: positiveInteger(8000, 20000),
  TELEGRAM_ALLOWED_CHAT_ID: z.string().regex(/^-?\d+$/).default("0"),
  SES_CONFIGURATION_SET: z.string().trim().min(1).max(64).optional(),
});

const secretSchema = z
  .object({
    supabaseUrl: z.string().url().refine((value) => value.startsWith("https://"), "supabaseUrl must use HTTPS"),
    supabaseServiceRoleKey: z.string().min(20),
    unsubscribeSecret: z.string().min(32),
    sesEventsWebhookSecret: z.string().min(32),
    publicBaseUrl: z.string().url().refine((value) => value.startsWith("https://"), "publicBaseUrl must use HTTPS"),
    telegramBotToken: z.string().min(20),
    telegramChatId: z.string().regex(/^-?\d+$/),
  })
  .refine(
    (value) => value.unsubscribeSecret !== value.sesEventsWebhookSecret,
    { message: "unsubscribeSecret and sesEventsWebhookSecret must be different" },
  );

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OrchestratorConfig {
  const parsed = envSchema.parse(env);
  return {
    secretArn: parsed.ORCHESTRATOR_SECRET_ARN,
    campaignKey: parsed.CAMPAIGN_KEY,
    runMode: parsed.RUN_MODE,
    pageSize: parsed.CANDIDATE_PAGE_SIZE,
    batchLimit: parsed.SEND_BATCH_LIMIT,
    leaseSeconds: parsed.CLAIM_LEASE_SECONDS,
    requestTimeoutMs: parsed.EXTERNAL_REQUEST_TIMEOUT_MS,
    allowedTelegramChatId: parsed.TELEGRAM_ALLOWED_CHAT_ID,
    ...(parsed.SES_CONFIGURATION_SET ? { sesConfigurationSet: parsed.SES_CONFIGURATION_SET } : {}),
  };
}

export function parseSecret(raw: string): OrchestratorSecret {
  return secretSchema.parse(JSON.parse(raw));
}
