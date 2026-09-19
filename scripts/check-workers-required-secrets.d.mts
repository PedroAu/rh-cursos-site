export const REQUIRED_WORKER_SECRETS: readonly string[];

export function parseSecretNames(output: string): string[];

export function findMissingSecrets(
  secretNames: readonly string[],
  requiredSecrets?: readonly string[],
): string[];

export function listWorkerSecretNames(options?: {
  workerName?: string;
  environment?: NodeJS.ProcessEnv;
}): string[];

export function main(): void;
