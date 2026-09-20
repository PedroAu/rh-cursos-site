export const APPLY_CONFIRMATION: string;

export type ProspectingCohortOptions = {
  mode: "DRY_RUN" | "APPLY";
  campaignKey: string;
  decisionKey: string | null;
  expectedDigest: string | null;
  approvalReference: string | null;
  expiresAt: string | null;
  actorId: string;
  confirmApply: string | null;
};

export function parseProspectingCohortArgs(argv: string[]): ProspectingCohortOptions;
export function executeProspectingCohort(input: {
  client: { rpc(name: string, params: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string; message?: string } | null }> };
  options: ProspectingCohortOptions;
}): Promise<unknown>;
export function main(argv?: string[], environment?: NodeJS.ProcessEnv): Promise<void>;
