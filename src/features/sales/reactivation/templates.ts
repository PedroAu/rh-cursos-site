import { createHash } from "node:crypto";

import type { ReactivationTemplateVariables } from "@/features/sales/reactivation/types";

type ReactivationTemplate = {
  stepIndex: 0 | 1 | 2;
  delayDays: 0 | 5 | 10;
  subject: string;
  body: string;
};

export const REACTIVATION_TEMPLATE_VERSION = "reactivation-v1-draft-1";

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

export function renderReactivationTemplate(stepIndex: number, values: ReactivationTemplateVariables) {
  const template = REACTIVATION_TEMPLATES.find((item) => item.stepIndex === stepIndex);
  if (!template) throw new Error("Etapa de reativação inválida.");
  const unsubscribeUrl = new URL(values.unsubscribeUrl);
  if (unsubscribeUrl.protocol !== "https:") throw new Error("Descadastro deve usar HTTPS.");
  const subject = interpolate(template.subject, values);
  const body = interpolate(template.body, values);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ version: REACTIVATION_TEMPLATE_VERSION, stepIndex, subject, body }))
    .digest("hex");
  return { subject, body, payloadHash, templateVersion: REACTIVATION_TEMPLATE_VERSION };
}
