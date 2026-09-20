import { describe, expect, it, vi } from "vitest";

import {
  APPLY_CONFIRMATION,
  executeProspectingCohort,
  parseProspectingCohortArgs,
} from "../../../scripts/approve-sales-prospecting-cohort.mjs";

describe("sales prospecting cohort CLI", () => {
  it("starts in aggregate dry-run without mutation arguments", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        evaluated: 3758,
        eligible: 3700,
        cohortDigest: "a".repeat(64),
        messagesSent: 0,
        unexpectedEmail: "pessoa@example.test",
      },
      error: null,
    });
    const options = parseProspectingCohortArgs([]);
    const result = await executeProspectingCohort({ client: { rpc }, options });
    expect(options).toMatchObject({ mode: "DRY_RUN", campaignKey: "prospecting-v1" });
    expect(rpc).toHaveBeenCalledWith("sales_plan_prospecting_permission_cohort", {
      p_campaign_key: "prospecting-v1",
    });
    expect(result).not.toHaveProperty("unexpectedEmail");
  });

  it("refuses apply without exact confirmation and digest", () => {
    expect(() => parseProspectingCohortArgs(["--mode", "apply"])).toThrow(APPLY_CONFIRMATION);
    expect(() => parseProspectingCohortArgs(["--mode"])).toThrow("--mode exige um valor");
  });

  it("requires an explicit timezone in the cohort expiry", () => {
    expect(() => parseProspectingCohortArgs([
      "--mode", "apply",
      "--decision-key", "controller-2026-09-19-prospecting-v1",
      "--expected-digest", "b".repeat(64),
      "--approval-reference", "https://github.com/example/repo/commit/abc123",
      "--expires-at", "2026-10-10T12:00:00",
      "--confirm-apply", APPLY_CONFIRMATION,
    ])).toThrow("offset explícito");
  });

  it("passes the reviewed immutable payload to the apply RPC", async () => {
    const digest = "b".repeat(64);
    const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    const options = parseProspectingCohortArgs([
      "--mode", "apply",
      "--decision-key", "controller-2026-09-19-prospecting-v1",
      "--expected-digest", digest,
      "--approval-reference", "https://github.com/example/repo/commit/abc123",
      "--expires-at", expiresAt,
      "--actor", "controller-pedro",
      "--confirm-apply", APPLY_CONFIRMATION,
    ]);
    const rpc = vi.fn().mockResolvedValue({ data: { approved: 3700 }, error: null });
    await executeProspectingCohort({ client: { rpc }, options });
    expect(rpc).toHaveBeenCalledWith("sales_apply_prospecting_permission_cohort", {
      p_campaign_key: "prospecting-v1",
      p_decision_key: "controller-2026-09-19-prospecting-v1",
      p_expected_digest: digest,
      p_approval_reference: "https://github.com/example/repo/commit/abc123",
      p_expires_at: expiresAt,
      p_actor_id: "controller-pedro",
    });
  });
});
