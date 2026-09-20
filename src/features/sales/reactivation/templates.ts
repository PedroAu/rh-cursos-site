import { createHash } from "node:crypto";

import type { ReactivationTemplateVariables } from "@/features/sales/reactivation/types";

type ReactivationTemplate = {
  stepIndex: 0 | 1 | 2;
  delayDays: 0 | 5 | 10;
  subject: string;
  body: string;
};

export const REACTIVATION_TEMPLATE_VERSION = "reactivation-v1-draft-1";
export const PROSPECTING_TEMPLATE_VERSION = "prospecting-v1-approved-1";

export const REACTIVATION_TEMPLATES: readonly ReactivationTemplate[] = [
  {
    stepIndex: 0,
    delayDays: 0,
    subject: "{{firstName}}, este tema ainda é prioridade para sua equipe?",
    body: "Olá, {{firstName}}. Estou retomando nosso contato sobre {{courseTitle}}. Se este tema ainda estiver no planejamento, posso encaminhar as próximas turmas e formatos disponíveis. Caso não queira receber novos contatos, use {{unsubscribeUrl}}.",
  },
  {
    stepIndex: 1,
    delayDays: 5,
    subject: "Posso enviar os detalhes de {{courseTitle}}?",
    body: "Olá, {{firstName}}. Passando apenas para confirmar se faz sentido receber informações atualizadas sobre {{courseTitle}}. Responda a este e-mail e eu encaminho os detalhes. Para encerrar os contatos, use {{unsubscribeUrl}}.",
  },
  {
    stepIndex: 2,
    delayDays: 10,
    subject: "Encerrando este contato sobre {{courseTitle}}",
    body: "Olá, {{firstName}}. Este é meu último contato desta sequência sobre {{courseTitle}}. Se quiser retomar depois, basta responder a este e-mail. Para não receber novas mensagens, use {{unsubscribeUrl}}.",
  },
] as const;

export const PROSPECTING_TEMPLATES: readonly ReactivationTemplate[] = [
  {
    stepIndex: 0,
    delayDays: 0,
    subject: "{{firstName}}, três capacitações para sua equipe em 2026",
    body: "Olá, {{firstName}}. Sou Pedro, da RH Cursos. Estamos divulgando três capacitações nacionais: Curso Prático de Atualização do eSocial — Novo Leiaute 1.3 para Órgãos Públicos; Auditoria da Folha de Pagamento; e Inteligência Artificial na Execução Orçamentária. Caso algum tema seja relevante para sua equipe, responda a este e-mail e eu envio datas, programa e investimento. Este contato utiliza dados fornecidos à RH Cursos ou disponíveis em fonte pública profissional. Para consultar, corrigir ou excluir seus dados, responda a este e-mail. Para não receber novos contatos, use {{unsubscribeUrl}}.",
  },
] as const;

const TEMPLATE_REGISTRY = {
  [REACTIVATION_TEMPLATE_VERSION]: REACTIVATION_TEMPLATES,
  [PROSPECTING_TEMPLATE_VERSION]: PROSPECTING_TEMPLATES,
} as const;

export type SalesCampaignTemplateVersion = keyof typeof TEMPLATE_REGISTRY;

export function isSupportedSalesCampaignTemplate(
  templateVersion: string,
): templateVersion is SalesCampaignTemplateVersion {
  return Object.hasOwn(TEMPLATE_REGISTRY, templateVersion);
}

function normalizeValue(value: string, maximum: number): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, maximum);
}
function interpolate(template: string, values: ReactivationTemplateVariables): string {
  const replacements: Record<string, string> = {
    firstName: normalizeValue(values.firstName, 80),
    courseTitle: normalizeValue(values.courseTitle, 180),
    unsubscribeUrl: values.unsubscribeUrl,
  };
  return template.replace(/{{(firstName|courseTitle|unsubscribeUrl)}}/g, (_, key: string) => replacements[key] ?? "");
}

export function renderSalesCampaignTemplate(
  templateVersion: string,
  stepIndex: number,
  values: ReactivationTemplateVariables,
) {
  if (!isSupportedSalesCampaignTemplate(templateVersion)) {
    throw new Error("Versão de template comercial não suportada.");
  }
  const templates: readonly ReactivationTemplate[] = TEMPLATE_REGISTRY[templateVersion];
  const template = templates.find((item) => item.stepIndex === stepIndex);
  if (!template) throw new Error(`Etapa ${stepIndex} inválida para ${templateVersion}.`);
  const unsubscribeUrl = new URL(values.unsubscribeUrl);
  if (unsubscribeUrl.protocol !== "https:") throw new Error("Descadastro deve usar HTTPS.");
  const subject = interpolate(template.subject, values);
  const body = interpolate(template.body, values);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ version: templateVersion, stepIndex, subject, body }))
    .digest("hex");
  return { subject, body, payloadHash, templateVersion };
}

export function renderReactivationTemplate(stepIndex: number, values: ReactivationTemplateVariables) {
  return renderSalesCampaignTemplate(REACTIVATION_TEMPLATE_VERSION, stepIndex, values);
}
