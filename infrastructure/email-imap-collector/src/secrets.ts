import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

import { parseCollectorSecret } from "./config.js";
import type { CollectorSecret } from "./types.js";

const client = new SecretsManagerClient({ maxAttempts: 3 });

let cache: { arn: string; value: CollectorSecret; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function loadCollectorSecret(secretArn: string, now = Date.now()): Promise<CollectorSecret> {
  if (cache?.arn === secretArn && cache.expiresAt > now) return cache.value;

  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!response.SecretString) throw new Error("Collector secret has no SecretString value.");

  const value = parseCollectorSecret(response.SecretString);
  cache = { arn: secretArn, value, expiresAt: now + CACHE_TTL_MS };
  return value;
}
