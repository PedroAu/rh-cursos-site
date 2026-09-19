import type { TelegramAlertInput } from "@/features/sales/reactivation/types";

const LABELS = {
  REPLIED: "Resposta recebida",
  BOUNCED: "Falha de entrega",
  COMPLAINED: "Reclamação",
  UNSUBSCRIBED: "Descadastro",
  PERMANENT_FAILURE: "Falha permanente",
  GUARDRAIL: "Guardrail acionado",
} as const;

function sanitize(value: string, maximum: number): string {
  return value.replace(/[<>]/g, "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, maximum);
}
export function maskEmail(value: string | null): string {
  if (!value) return "não informado";
  const [local, domain] = value.split("@");
  if (!local || !domain) return "inválido";
  return `${local.slice(0, 2)}***@${domain}`;
}

export function formatTelegramAlert(input: TelegramAlertInput): string {
  const crmUrl = new URL(input.crmUrl);
  if (crmUrl.protocol !== "https:") throw new Error("Link do CRM deve usar HTTPS.");
  const occurredAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(input.occurredAt));
  return [
    `[RH Cursos] ${LABELS[input.kind]}`,
    `Lead: ${sanitize(input.leadName, 100)} (${maskEmail(input.leadEmail)})`,
    `Quando: ${occurredAt}`,
    `Resumo: ${sanitize(input.safeSummary, 240)}`,
    `CRM: ${crmUrl.toString()}`,
  ].join("\n");
}
