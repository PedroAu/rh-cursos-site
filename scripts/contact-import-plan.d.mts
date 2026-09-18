export type ContactImportSource = { name: string; text: string };

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
export function main(argv?: string[]): void;
