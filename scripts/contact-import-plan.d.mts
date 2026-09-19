export type ContactImportSource = { name: string; text: string };
export type ContactImportCandidate = {
  sourceKey: string;
  name: string;
  email: string;
  phone: string | null;
  organization: string | null;
  hasSourceHistory: boolean;
  sourceLastActivityAt: string | null;
  sourceEventType: "SENT" | "BOUNCED" | "COMPLAINED" | "UNSUBSCRIBED" | null;
  sourceEventAt: string | null;
  legalBasis: "CONSENT" | "LEGITIMATE_INTEREST" | "CONTRACT" | "OTHER" | null;
};

export type ContactImportPlan = {
  mode: "READ_ONLY_IMPORT_PLAN";
  classification: "Gestão de Pessoas";
  reference_date: string;
  inactivity_window_days: number;
  source_files: Array<{
    file: string;
    schema: string;
    rows: number;
    valid_email_rows: number;
    invalid_email_rows: number;
    distinct_emails: number;
    duplicate_rows_by_email: number;
  }>;
  totals: {
    rows: number;
    canonical_records_by_exact_email: number;
    rows_collapsed_by_exact_email: number;
    existing_in_crm_snapshot: number;
    new_vs_crm_snapshot: number;
  };
  evidence: Record<string, number>;
  new_vs_crm_evidence: Record<string, number>;
  conflicts_requiring_review: Record<string, number>;
  preliminary_reason_codes: Record<string, number>;
  new_vs_crm_reason_codes: Record<string, number>;
  safeguards: {
    writes_performed: 0;
    external_messages_sent: 0;
    contacts_authorized_for_send: 0;
    next_gate: string;
  };
};

export function normalizeEmail(value: unknown): string | null;
export function normalizePhone(value: unknown): string | null;
export function parseCsv(text: string): { headers: string[]; rows: string[][] };
export function buildContactImportPlan(options: {
  sources: ContactImportSource[];
  crmSourceName: string;
  referenceDate?: string | Date | null;
  inactiveDays?: number;
}): ContactImportPlan;
export function buildContactImportCandidates(options: { sources: ContactImportSource[] }): {
  candidates: ContactImportCandidate[];
  fileSetDigest: string;
  sourceRows: number;
  stats: {
    canonical_records: number;
    candidates_ready: number;
    blocked_name_conflicts: number;
    blocked_invalid_provider_addresses: number;
    organization_conflicts_omitted: number;
    phone_conflicts_omitted: number;
    invalid_email_rows: number;
  };
};
export function main(argv?: string[]): void;
