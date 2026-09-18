import type { ContactImportCandidate } from "./contact-import-plan.mjs";

export type ContactImportOptions = {
  mode: "DRY_RUN" | "APPLY";
  sourceLabel: string;
  approvalReference: string | null;
  actorId: string;
  confirmApply: string | null;
  files: string[];
};

export function parseImportArgs(argv: string[]): ContactImportOptions;
export function executeContactImport(options: {
  client: { rpc(name: string, params: Record<string, unknown>): Promise<{ data: unknown; error: null | { code?: string } }> };
  prepared: {
    candidates: ContactImportCandidate[];
    fileSetDigest: string;
    sourceRows: number;
    stats: Record<string, number>;
  };
  options: Omit<ContactImportOptions, "files">;
}): Promise<Record<string, unknown>>;
export function main(argv?: string[], environment?: NodeJS.ProcessEnv): Promise<void>;
