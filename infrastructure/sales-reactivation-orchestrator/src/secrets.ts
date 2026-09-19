import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

import { parseSecret } from "./config.js";
import type { OrchestratorSecret } from "./types.js";

const client = new SecretsManagerClient({ maxAttempts: 3 });
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { arn: string; value: OrchestratorSecret; expiresAt: number } | null = null;

export async function loadSecret(secretArn: string, now = Date.now()): Promise<OrchestratorSecret> {
  if (cache?.arn === secretArn && cache.expiresAt > now) return cache.value;
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!response.SecretString) throw new Error("Orchestrator secret has no SecretString value.");
  const value = parseSecret(response.SecretString);
  cache = { arn: secretArn, value, expiresAt: now + CACHE_TTL_MS };
  return value;
}
