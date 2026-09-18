import { describe, expect, it, vi } from "vitest";

import { executeContactImport, parseImportArgs } from "../../../scripts/import-contacts.mjs";
import type { ContactImportCandidate } from "../../../scripts/contact-import-plan.mjs";

const candidate: ContactImportCandidate = {
  sourceKey: "1".repeat(64),
  name: "Ana Exemplo",
  email: "ana@example.test",
  phone: null,
  organization: "Órgão Exemplo",
  hasSourceHistory: true,
  sourceLastActivityAt: "2026-08-01T12:00:00.000Z",
  sourceEventType: "SENT",
  sourceEventAt: "2026-08-01T12:00:00.000Z",
  legalBasis: "LEGITIMATE_INTEREST",
};

describe("contact import execution", () => {
  it("defaults to dry-run and requires an explicit apply confirmation", () => {
    expect(parseImportArgs(["base.csv"])).toMatchObject({ mode: "DRY_RUN", files: ["base.csv"] });
    expect(() => parseImportArgs(["--mode", "apply", "base.csv"])).toThrow("--confirm-apply");
    expect(() =>
      parseImportArgs([
        "--mode",
        "apply",
        "--confirm-apply",
        "APPLY_CONTACTS_TO_CRM",
        "base.csv",
      ]),
    ).toThrow("--approval-reference");
  });

  it("sends PII only to the controlled RPC and returns aggregate output", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "sales_create_contact_import_batch") {
        return { data: "30000000-0000-4000-8000-000000000003", error: null };
      }
      if (name === "sales_import_contact_candidate") {
        return {
          data: [{ action: "WOULD_CREATE", reason_codes: ["DRY_RUN_ONLY"] }],
          error: null,
        };
      }
      return { data: true, error: null };
    });
    const report = await executeContactImport({
      client: { rpc },
      prepared: {
        candidates: [candidate],
        fileSetDigest: "a".repeat(64),
        sourceRows: 1,
        stats: { candidates_ready: 1 },
      },
      options: {
        mode: "DRY_RUN",
        sourceLabel: "unit-test",
        approvalReference: null,
        actorId: "vitest",
        confirmApply: null,
      },
    });

    expect(rpc).toHaveBeenCalledWith(
      "sales_import_contact_candidate",
      expect.objectContaining({ p_email: "ana@example.test", p_source_event_at: candidate.sourceEventAt }),
    );
    expect(JSON.stringify(report)).not.toContain("ana@example.test");
    expect(report).toMatchObject({
      candidates_processed: 1,
      actions: { WOULD_CREATE: 1 },
      messages_sent: 0,
      reactivation_sequences_created: 0,
    });
  });

  it("does not complete a batch after an RPC failure", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "sales_create_contact_import_batch") {
        return { data: "30000000-0000-4000-8000-000000000003", error: null };
      }
      return { data: null, error: { code: "P0001" } };
    });
    await expect(
      executeContactImport({
        client: { rpc },
        prepared: {
          candidates: [candidate],
          fileSetDigest: "a".repeat(64),
          sourceRows: 1,
          stats: {},
        },
        options: {
          mode: "DRY_RUN",
          sourceLabel: "unit-test",
          approvalReference: null,
          actorId: "vitest",
          confirmApply: null,
        },
      }),
    ).rejects.toThrow("sales_import_contact_candidate falhou (P0001)");
    expect(rpc).not.toHaveBeenCalledWith("sales_complete_contact_import_batch", expect.anything());
  });
});
