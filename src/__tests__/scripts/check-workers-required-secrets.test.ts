import { describe, expect, it } from "vitest";

import {
  findMissingSecrets,
  parseSecretNames,
  REQUIRED_WORKER_SECRETS,
} from "../../../scripts/check-workers-required-secrets.mjs";

describe("check-workers-required-secrets", () => {
  it("aceita somente metadados do Wrangler e retorna os nomes", () => {
    expect(parseSecretNames('[{"name":"FIRST","type":"secret_text"},{"name":"SECOND"}]'))
      .toEqual(["FIRST", "SECOND"]);
  });

  it("rejeita resposta que não seja uma lista válida", () => {
    expect(() => parseSecretNames("{}"))
      .toThrow("deve ser uma lista de metadados");
    expect(() => parseSecretNames('[{"type":"secret_text"}]'))
      .toThrow("sem nome válido");
  });

  it("reporta somente secrets obrigatórios ausentes", () => {
    const configured = REQUIRED_WORKER_SECRETS.filter(
      (name) => name !== "SES_EVENTS_WEBHOOK_SECRET" && name !== "EMAIL_UNSUBSCRIBE_SECRET",
    );

    expect(findMissingSecrets(configured)).toEqual([
      "EMAIL_UNSUBSCRIBE_SECRET",
      "SES_EVENTS_WEBHOOK_SECRET",
    ]);
  });

  it("passa quando todos os secrets obrigatórios existem", () => {
    expect(findMissingSecrets([...REQUIRED_WORKER_SECRETS])).toEqual([]);
  });
});
