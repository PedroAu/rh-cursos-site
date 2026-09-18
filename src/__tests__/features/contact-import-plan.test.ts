import { describe, expect, it } from "vitest";

import {
  buildContactImportCandidates,
  buildContactImportPlan,
  normalizeEmail,
  normalizePhone,
  parseCsv,
} from "../../../scripts/contact-import-plan.mjs";

const crmCsv = `ID do registro. - Contact,Nome,Sobrenome,E-mail,Número de telefone,Status do contato de marketing
crm-1,Ana,Silva,ANA@example.com,+55 11 99999-0000,
`;

const segmentCsv = `ID do registro - Contact,Nome,Sobrenome,E-mail,Número de telefone,Data da última atividade,Nome da empresa
hs-1,Ana,S.,ana@example.com,11999990000,2026-09-10T12:00:00Z,Órgão A
hs-2,Bia,Souza,bia@example.com,,,Órgão B
`;

const leadsCsv = `nome,empresa,email,lgpd_base,email_status,email_data,stage,brevo_message_id,brevo_event_status,brevo_events_total,brevo_unsubscribed,brevo_complaints,brevo_invalid
Ana Silva,Órgão A,ana@example.com,legitimo_interesse,Enviado,2026-09-10T12:00:00Z,Contatado,msg-1,opened,2,0,0,0
Bia Souza,Órgão B,bia@example.com,legitimo_interesse,Pendente,,Pendente,,,0,0,0,0
Caio Lima,Órgão C,caio@example.com,legitimo_interesse,Bounce,2026-07-01T12:00:00Z,Descadastrado,msg-3,hard_bounce,1,0,0,0
`;

describe("contact import plan", () => {
  it("normalizes identifiers without accepting malformed values", () => {
    expect(normalizeEmail(" ANA@Example.COM ")).toBe("ana@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizePhone("+55 (11) 99999-0000")).toBe("11999990000");
    expect(normalizePhone("123")).toBeNull();
  });

  it("parses RFC 4180 quoting and preserves duplicate headers by position", () => {
    const parsed = parseCsv('Nome,Número de telefone,Número de telefone\r\n"Ana, A.",11999990000,1133334444\r\n');
    expect(parsed.headers).toEqual(["Nome", "Número de telefone", "Número de telefone"]);
    expect(parsed.rows).toEqual([["Ana, A.", "11999990000", "1133334444"]]);
  });

  it("deduplicates by exact normalized email and never authorizes a send", () => {
    const plan = buildContactImportPlan({
      sources: [
        { name: "crm.csv", text: crmCsv },
        { name: "segment.csv", text: segmentCsv },
        { name: "leads.csv", text: leadsCsv },
      ],
      crmSourceName: "crm.csv",
      referenceDate: "2026-09-18T12:00:00Z",
      inactiveDays: 15,
    });

    expect(plan.totals).toEqual({
      rows: 6,
      canonical_records_by_exact_email: 3,
      rows_collapsed_by_exact_email: 3,
      existing_in_crm_snapshot: 1,
      new_vs_crm_snapshot: 2,
    });
    expect(plan.preliminary_reason_codes).toEqual({
      RECENT_SOURCE_INTERACTION: 1,
      REQUIRES_CRM_HISTORY_CHECK: 1,
      SUPPRESSED_SOURCE_EVIDENCE: 1,
    });
    expect(plan.new_vs_crm_reason_codes).toEqual({
      REQUIRES_CRM_HISTORY_CHECK: 1,
      SUPPRESSED_SOURCE_EVIDENCE: 1,
    });
    expect(plan.safeguards.contacts_authorized_for_send).toBe(0);
    expect(plan.safeguards.writes_performed).toBe(0);
  });

  it("returns aggregates without leaking contact values", () => {
    const plan = buildContactImportPlan({
      sources: [
        { name: "crm.csv", text: crmCsv },
        { name: "leads.csv", text: leadsCsv },
      ],
      crmSourceName: "crm.csv",
      referenceDate: "2026-09-18T12:00:00Z",
    });
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toContain("ana@example.com");
    expect(serialized).not.toContain("Ana Silva");
    expect(serialized).not.toContain("11999990000");
  });

  it("fails closed for an unknown schema", () => {
    expect(() =>
      buildContactImportPlan({
        sources: [{ name: "unknown.csv", text: "foo,bar\n1,2\n" }],
        crmSourceName: "unknown.csv",
      }),
    ).toThrow("Schema CSV não reconhecido");
  });

  it("builds deterministic private RPC candidates and blocks conflicting names", () => {
    const result = buildContactImportCandidates({
      sources: [
        { name: "segment.csv", text: segmentCsv },
        { name: "leads.csv", text: leadsCsv },
      ],
    });
    const reversed = buildContactImportCandidates({
      sources: [
        { name: "leads.csv", text: leadsCsv },
        { name: "segment.csv", text: segmentCsv },
      ],
    });

    expect(result.fileSetDigest).toBe(reversed.fileSetDigest);
    expect(result.fileSetDigest).toBe(
      buildContactImportCandidates({
        sources: [
          { name: "arquivo-renomeado-a.csv", text: segmentCsv },
          { name: "arquivo-renomeado-b.csv", text: leadsCsv },
        ],
      }).fileSetDigest,
    );
    expect(result.stats).toMatchObject({
      canonical_records: 3,
      candidates_ready: 2,
      blocked_name_conflicts: 1,
      invalid_email_rows: 0,
    });
    expect(result.candidates.map((candidate) => candidate.email).sort()).toEqual([
      "bia@example.com",
      "caio@example.com",
    ]);
    expect(result.candidates.find((candidate) => candidate.email === "caio@example.com")).toMatchObject({
      sourceEventType: "BOUNCED",
      sourceEventAt: "2026-07-01T12:00:00.000Z",
      legalBasis: "LEGITIMATE_INTEREST",
    });
  });

  it("blocks provider-invalid addresses before any RPC payload is built", () => {
    const invalidCsv = `nome,email,lgpd_base,brevo_message_id,brevo_invalid
Dana Exemplo,dana@example.com,legitimo_interesse,,1
`;
    const result = buildContactImportCandidates({
      sources: [{ name: "invalid.csv", text: invalidCsv }],
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.stats.blocked_invalid_provider_addresses).toBe(1);
  });
});
