import { describe, expect, it } from "vitest";

import { buildReactivationScorecard, estimateSesBaseCost } from "@/features/sales/reactivation/metrics";
import { evaluateReactivationEligibility } from "@/features/sales/reactivation/policy";
import { formatTelegramAlert } from "@/features/sales/reactivation/telegram";
import {
  PROSPECTING_TEMPLATE_VERSION,
  renderReactivationTemplate,
  renderSalesCampaignTemplate,
} from "@/features/sales/reactivation/templates";
import type { ReactivationCandidate, ReactivationControl } from "@/features/sales/reactivation/types";

const now = new Date("2026-09-18T13:00:00.000Z");
const candidate: ReactivationCandidate = {
  leadId: "lead-1",
  deletedAt: null,
  email: "pessoa@example.com",
  permission: {
    status: "APPROVED",
    legalBasis: "CONSENT",
    purpose: "COMMERCIAL_REACTIVATION",
    verifiedAt: "2026-08-01T00:00:00.000Z",
    expiresAt: null,
  },
  suppressed: false,
  hasActiveSequence: false,
  hasCampaignSequence: false,
  lastInteractionAt: "2026-08-01T00:00:00.000Z",
  minimumInactivityDays: 15,
  course: "Auditoria da Folha de Pagamento",
};
const control: ReactivationControl = {
  enabled: false,
  dryRun: true,
  killSwitch: true,
  timezone: "America/Sao_Paulo",
  sendWindowStart: 8,
  sendWindowEnd: 18,
  dailyLimit: 25,
  sentToday: 0,
};

describe("sales reactivation core", () => {
  it("aprova apenas em dry-run quando todos os guardrails passam", () => {
    expect(evaluateReactivationEligibility({
      candidate,
      campaign: { status: "DISABLED", contentStatus: "APPROVED", permissionPurpose: "COMMERCIAL_REACTIVATION" },
      control,
      now,
    })).toEqual({ eligible: true, mode: "DRY_RUN", reasonCodes: ["DRY_RUN_ONLY"] });
  });

  it("falha fechado sem permissão e com supressão", () => {
    const result = evaluateReactivationEligibility({
      candidate: { ...candidate, permission: null, suppressed: true },
      campaign: { status: "ACTIVE", contentStatus: "APPROVED", permissionPurpose: "COMMERCIAL_REACTIVATION" },
      control: { ...control, dryRun: false },
      now,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["PERMISSION_MISSING", "SUPPRESSED"]));
  });

  it("não trata classificação temática como permissão", () => {
    const result = evaluateReactivationEligibility({
      candidate: { ...candidate, permission: null, course: "Auditoria da Folha de Pagamento" },
      campaign: { status: "ACTIVE", contentStatus: "APPROVED", permissionPurpose: "COMMERCIAL_REACTIVATION" },
      control,
      now,
    });
    expect(result).toMatchObject({ eligible: false, mode: "BLOCKED" });
    expect(result.reasonCodes).toContain("PERMISSION_MISSING");
  });

  it("renderiza conteúdo determinístico, com descadastro HTTPS e hash estável", () => {
    const values = {
      firstName: "Ana\nSilva",
      courseTitle: "Auditoria da Folha de Pagamento" as const,
      unsubscribeUrl: "https://rhcursos.com.br/api/email/unsubscribe?token=abc",
    };
    const first = renderReactivationTemplate(0, values);
    const second = renderReactivationTemplate(0, values);
    expect(first.subject).not.toContain("\n");
    expect(first.body).toContain(values.courseTitle);
    expect(first.payloadHash).toBe(second.payloadHash);
    expect(() => renderReactivationTemplate(0, { ...values, unsubscribeUrl: "http://example.com" })).toThrow(/HTTPS/);
  });

  it("renderiza apenas o primeiro contato aprovado da campanha de prospecção", () => {
    const rendered = renderSalesCampaignTemplate(PROSPECTING_TEMPLATE_VERSION, 0, {
      firstName: "Ana",
      courseTitle: "Gestão de Pessoas",
      unsubscribeUrl: "https://rhcursos.com.br/api/email/unsubscribe?token=abc",
    });
    expect(rendered.subject).toBe("Ana, três capacitações para sua equipe em 2026");
    expect(rendered.body).toContain("dados fornecidos à RH Cursos ou disponíveis em fonte pública profissional");
    expect(rendered.body).toContain("https://rhcursos.com.br/api/email/unsubscribe?token=abc");
    expect(() => renderSalesCampaignTemplate(PROSPECTING_TEMPLATE_VERSION, 1, {
      firstName: "Ana",
      courseTitle: "Gestão de Pessoas",
      unsubscribeUrl: "https://rhcursos.com.br/api/email/unsubscribe?token=abc",
    })).toThrow(/Etapa/);
  });

  it("valida o propósito contra a campanha carregada", () => {
    const prospectingCandidate = {
      ...candidate,
      course: "Gestão de Pessoas",
      permission: { ...candidate.permission!, purpose: "COMMERCIAL_PROSPECTING" },
    };
    expect(evaluateReactivationEligibility({
      candidate: prospectingCandidate,
      campaign: { status: "DISABLED", contentStatus: "APPROVED", permissionPurpose: "COMMERCIAL_PROSPECTING" },
      control,
      now,
    })).toMatchObject({ eligible: true, mode: "DRY_RUN" });

    const mismatch = evaluateReactivationEligibility({
      candidate: prospectingCandidate,
      campaign: { status: "DISABLED", contentStatus: "APPROVED", permissionPurpose: "COMMERCIAL_REACTIVATION" },
      control,
      now,
    });
    expect(mismatch.eligible).toBe(false);
    expect(mismatch.reasonCodes).toContain("PURPOSE_MISMATCH");
  });

  it("não exige comprovação individual de inatividade na prospecção aprovada", () => {
    const prospectingCandidate = {
      ...candidate,
      course: "Gestão de Pessoas",
      lastInteractionAt: "2026-09-18T12:59:00.000Z",
      permission: { ...candidate.permission!, purpose: "COMMERCIAL_PROSPECTING" },
    };
    expect(evaluateReactivationEligibility({
      candidate: prospectingCandidate,
      campaign: { status: "DISABLED", contentStatus: "APPROVED", permissionPurpose: "COMMERCIAL_PROSPECTING" },
      control,
      now,
    })).toMatchObject({ eligible: true, mode: "DRY_RUN" });
  });

  it("formata alerta Telegram sem corpo, HTML ou e-mail completo", () => {
    const alert = formatTelegramAlert({
      kind: "REPLIED",
      leadName: "Ana <Silva>",
      leadEmail: "ana.silva@example.com",
      occurredAt: "2026-09-18T12:00:00.000Z",
      safeSummary: "Resposta recebida por e-mail.\nSem corpo integral.",
      crmUrl: "https://rhcursos.com.br/admin/leads?lead=lead-1",
    });
    expect(alert).toContain("Resposta recebida");
    expect(alert).toContain("an***@example.com");
    expect(alert).not.toContain("ana.silva@example.com");
    expect(alert).not.toContain("<Silva>");
  });

  it("agrega scorecard descritivo sem inferir causalidade", () => {
    expect(buildReactivationScorecard({
      decisions: [
        { eligible: true, reasonCodes: ["DRY_RUN_ONLY"] },
        { eligible: false, reasonCodes: ["SUPPRESSED", "PERMISSION_BLOCKED"] },
      ],
      interactions: [{ eventType: "SENT" }, { eventType: "DELIVERED" }, { eventType: "REPLIED" }],
      toolFailures: 1,
      interruptedSequences: 2,
    })).toMatchObject({
      eligible: 1,
      rejected: 1,
      rejectedByReason: { SUPPRESSED: 1, PERMISSION_BLOCKED: 1 },
      sent: 1,
      delivered: 1,
      replied: 1,
      interruptedSequences: 2,
      positiveReplies: null,
      toolFailures: 1,
    });
  });

  it("estima custo SES como faixa explícita quando o plano da conta é desconhecido", () => {
    expect(estimateSesBaseCost(1_000)).toMatchObject({
      status: "RANGE_WITHOUT_ACCOUNT_PLAN",
      sent: 1_000,
      currency: "USD",
      lowUsd: 0.1,
      highUsd: 0.23,
    });
    expect(estimateSesBaseCost(Number.NaN).sent).toBe(0);
  });
});
