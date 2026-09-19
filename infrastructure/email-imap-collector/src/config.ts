import { z } from "zod";

import type { CollectorConfig, CollectorSecret } from "./types.js";

const positiveInteger = (fallback: number, maximum: number) =>
  z.coerce.number().int().positive().max(maximum).default(fallback);

const envSchema = z.object({
  CHECKPOINT_TABLE: z.string().trim().min(1),
  COLLECTOR_SECRET_ARN: z.string().trim().min(1),
  IMAP_MAILBOX: z.string().trim().min(1).max(120).default("INBOX"),
  IMAP_ACCOUNT_KEY: z.string().trim().min(1).max(180).default("locaweb:pedro:INBOX"),
  IMAP_FALLBACK_RECIPIENT: z.string().email().max(180).default("pedro@rhcursos.com.br"),
  INITIAL_LOOKBACK_DAYS: positiveInteger(15, 90),
  IMAP_BATCH_SIZE: positiveInteger(50, 200),
  CRM_REQUEST_TIMEOUT_MS: positiveInteger(8000, 20000),
});

const secretSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535).default(993),
  secure: z.boolean().default(true),
  user: z.string().email().max(180),
  password: z.string().min(1).max(1024),
  endpointUrl: z.string().url().refine((value) => value.startsWith("https://"), "endpointUrl must use HTTPS"),
  webhookSecret: z.string().min(32).max(512),
  rejectUnauthorized: z.boolean().default(true),
  servername: z.string().trim().min(1).max(255).optional(),
});

export function loadCollectorConfig(env: NodeJS.ProcessEnv = process.env): CollectorConfig {
  const parsed = envSchema.parse(env);
  return {
    checkpointTable: parsed.CHECKPOINT_TABLE,
    secretArn: parsed.COLLECTOR_SECRET_ARN,
    mailbox: parsed.IMAP_MAILBOX,
    accountKey: parsed.IMAP_ACCOUNT_KEY,
    fallbackRecipient: parsed.IMAP_FALLBACK_RECIPIENT,
    initialLookbackDays: parsed.INITIAL_LOOKBACK_DAYS,
    batchSize: parsed.IMAP_BATCH_SIZE,
    requestTimeoutMs: parsed.CRM_REQUEST_TIMEOUT_MS,
  };
}

export function parseCollectorSecret(raw: string): CollectorSecret {
  return secretSchema.parse(JSON.parse(raw));
}
