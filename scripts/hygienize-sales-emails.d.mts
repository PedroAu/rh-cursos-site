export const APPLY_CONFIRMATION: "APPLY_EMAIL_HYGIENE";

export function normalizeEmailForHygiene(value: unknown): {
  email: string;
  domain: string;
} | null;

export function classifyDomainChecks(checks: Array<{
  route: boolean;
  definitiveNoRoute: boolean;
}>): "DNS_VALID" | "NO_MAIL_ROUTE" | "DNS_INCONCLUSIVE";

export function recoverySnapshotDigest(
  blocked: Array<Record<string, unknown>>,
  steps: Array<Record<string, unknown>>,
): string;

export function summarizeResults(results: Array<{
  result: "ELIGIBLE" | "BLOCKED";
  reason_code: string;
}>): {
  evaluated: number;
  eligible: number;
  blocked: number;
  reasons: Record<string, number>;
};

export function parseArgs(argv: string[]): {
  mode: "DRY_RUN" | "APPLY";
  campaignKey: string;
  runKey: string | null;
  actorId: string;
  confirmApply: string | null;
};

export function main(argv?: string[], environment?: NodeJS.ProcessEnv): Promise<void>;
