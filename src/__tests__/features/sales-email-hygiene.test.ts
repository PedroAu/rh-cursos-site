import { describe, expect, it } from "vitest";

import {
  classifyDomainChecks,
  normalizeEmailForHygiene,
  parseArgs,
  recoverySnapshotDigest,
  summarizeResults,
} from "../../../scripts/hygienize-sales-emails.mjs";

describe("sales email hygiene", () => {
  it("normaliza um endereco valido e rejeita sintaxe ambigua", () => {
    expect(normalizeEmailForHygiene(" Pessoa@Exemplo.COM ")).toEqual({
      email: "pessoa@exemplo.com",
      domain: "exemplo.com",
    });
    expect(normalizeEmailForHygiene("a..b@example.com")).toBeNull();
    expect(normalizeEmailForHygiene("duplo@@example.com")).toBeNull();
    expect(normalizeEmailForHygiene(`${"a".repeat(65)}@example.com`)).toBeNull();
    expect(normalizeEmailForHygiene(`${"a".repeat(243)}@example.com`)).toBeNull();
    expect(normalizeEmailForHygiene("pessoa@exâmple.com")).toEqual({
      email: "pessoa@xn--exmple-xta.com",
      domain: "xn--exmple-xta.com",
    });
  });

  it("so bloqueia dominio quando todos os resolvedores confirmam ausencia de rota", () => {
    expect(classifyDomainChecks([])).toBe("DNS_INCONCLUSIVE");
    expect(classifyDomainChecks([
      { route: false, definitiveNoRoute: true },
      { route: false, definitiveNoRoute: true },
    ])).toBe("NO_MAIL_ROUTE");
    expect(classifyDomainChecks([
      { route: false, definitiveNoRoute: true },
      { route: false, definitiveNoRoute: false },
    ])).toBe("DNS_INCONCLUSIVE");
    expect(classifyDomainChecks([
      { route: true, definitiveNoRoute: false },
      { route: false, definitiveNoRoute: true },
    ])).toBe("DNS_INCONCLUSIVE");
  });

  it("resume somente contagens e reason codes", () => {
    expect(summarizeResults([
      { result: "ELIGIBLE", reason_code: "DNS_VALID" },
      { result: "BLOCKED", reason_code: "INVALID_SYNTAX" },
    ])).toEqual({
      evaluated: 2,
      eligible: 1,
      blocked: 1,
      reasons: { DNS_VALID: 1, INVALID_SYNTAX: 1 },
    });
  });

  it("exige confirmacao textual e run key no modo apply", () => {
    expect(() => parseArgs(["--campaign-key"])).toThrow("exige um valor");
    expect(() => parseArgs(["--mode", "qualquer"])).toThrow("--mode deve ser");
    expect(() => parseArgs(["--mode", "apply", "--campaign-key", "prospecting-v1@1"])).toThrow(
      "APPLY exige --confirm-apply APPLY_EMAIL_HYGIENE",
    );
    expect(() => parseArgs([
      "--mode", "apply",
      "--campaign-key", "prospecting-v1@1",
      "--confirm-apply", "APPLY_EMAIL_HYGIENE",
      "--run-key", "../../arquivo-fora",
    ])).toThrow("caracteres seguros");
  });

  it("permite retomar o mesmo snapshot quando apenas checked_at muda", () => {
    const first = recoverySnapshotDigest([
      { lead_id: "lead-1", sequence_id: "sequence-1", result: "BLOCKED", checked_at: "2026-09-21T10:00:00Z" },
    ], [{ id: "step-1", sequence_id: "sequence-1", status: "PENDING" }]);
    const retry = recoverySnapshotDigest([
      { lead_id: "lead-1", sequence_id: "sequence-1", result: "BLOCKED", checked_at: "2026-09-21T10:05:00Z" },
    ], [{ id: "step-1", sequence_id: "sequence-1", status: "PENDING" }]);
    expect(retry).toBe(first);
  });
});
