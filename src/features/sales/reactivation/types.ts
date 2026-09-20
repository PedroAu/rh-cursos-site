export const REACTIVATION_COURSES = [
  "Curso Prático de Atualização do eSocial: Novo Leiaute 1.3 para Órgãos Públicos",
  "Auditoria da Folha de Pagamento",
  "Inteligência Artificial na Execução Orçamentária",
] as const;

export type ReactivationCourse = (typeof REACTIVATION_COURSES)[number];

export const PROSPECTING_SUBJECTS = ["Gestão de Pessoas"] as const;
export type ProspectingSubject = (typeof PROSPECTING_SUBJECTS)[number];
export type SalesCampaignSubject = ReactivationCourse | ProspectingSubject;

export const REACTIVATION_REASON_CODES = [
  "ELIGIBLE",
  "AUTOMATION_DISABLED",
  "DRY_RUN_ONLY",
  "GLOBAL_KILL_SWITCH",
  "CAMPAIGN_INACTIVE",
  "CONTENT_NOT_APPROVED",
  "OUTSIDE_SEND_WINDOW",
  "DAILY_LIMIT_REACHED",
  "LEAD_DELETED",
  "EMAIL_MISSING",
  "EMAIL_INVALID",
  "PERMISSION_MISSING",
  "PERMISSION_BLOCKED",
  "PERMISSION_EXPIRED",
  "PURPOSE_MISMATCH",
  "SUPPRESSED",
  "ACTIVE_SEQUENCE_EXISTS",
  "CAMPAIGN_ALREADY_PROCESSED",
  "RECENT_INTERACTION",
  "COURSE_NOT_APPROVED",
] as const;

export type ReactivationReasonCode = (typeof REACTIVATION_REASON_CODES)[number];

export type ContactPermission = {
  status: "APPROVED" | "BLOCKED" | "UNKNOWN";
  legalBasis: "CONSENT" | "LEGITIMATE_INTEREST" | "CONTRACT" | "OTHER" | null;
  purpose: string;
  verifiedAt: string;
  expiresAt: string | null;
};

export type ReactivationControl = {
  enabled: boolean;
  dryRun: boolean;
  killSwitch: boolean;
  timezone: "America/Sao_Paulo";
  sendWindowStart: number;
  sendWindowEnd: number;
  dailyLimit: number;
  sentToday: number;
};

export type ReactivationCandidate = {
  leadId: string;
  deletedAt: string | null;
  email: string | null;
  permission: ContactPermission | null;
  suppressed: boolean;
  hasActiveSequence: boolean;
  hasCampaignSequence: boolean;
  lastInteractionAt: string | null;
  minimumInactivityDays: number;
  course: string | null;
};

export type ReactivationCampaignState = {
  status: "DISABLED" | "ACTIVE" | "PAUSED";
  contentStatus: "DRAFT" | "APPROVED" | "RETIRED";
  permissionPurpose: "COMMERCIAL_REACTIVATION" | "COMMERCIAL_PROSPECTING";
};

export type EligibilityDecision = {
  eligible: boolean;
  mode: "BLOCKED" | "DRY_RUN" | "LIVE";
  reasonCodes: ReactivationReasonCode[];
};

export type ReactivationTemplateVariables = {
  firstName: string;
  courseTitle: SalesCampaignSubject;
  unsubscribeUrl: string;
};

export type TelegramAlertKind =
  | "REPLIED"
  | "BOUNCED"
  | "COMPLAINED"
  | "UNSUBSCRIBED"
  | "PERMANENT_FAILURE"
  | "GUARDRAIL";

export type TelegramAlertInput = {
  kind: TelegramAlertKind;
  leadName: string;
  leadEmail: string | null;
  occurredAt: string;
  safeSummary: string;
  crmUrl: string;
};
