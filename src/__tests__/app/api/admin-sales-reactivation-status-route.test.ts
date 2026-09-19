import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  getReactivationStatus: vi.fn(),
}));

vi.mock("@/lib/supabase/admin-api-auth", () => ({ requireAdminApi: mocks.requireAdminApi }));
vi.mock("@/features/sales/reactivation/status", () => ({ getReactivationStatus: mocks.getReactivationStatus }));

import { GET } from "../../../../app/api/admin/sales/reactivation/status/route";

describe("GET /api/admin/sales/reactivation/status", () => {
  beforeEach(() => {
    mocks.requireAdminApi.mockReset();
    mocks.getReactivationStatus.mockReset();
  });

  it("falha fechado antes de consultar dados sem autorização", async () => {
    mocks.requireAdminApi.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 401 }),
    });
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.getReactivationStatus).not.toHaveBeenCalled();
  });

  it("retorna somente o status operacional ao admin", async () => {
    const adminClient = { from: vi.fn() };
    mocks.requireAdminApi.mockResolvedValue({ ok: true, adminClient });
    mocks.getReactivationStatus.mockResolvedValue({
      campaign: { key: "reactivation-v1", status: "DISABLED" },
      control: { enabled: false, dryRun: true, killSwitch: true },
      counters: { pendingSteps: 0 },
    });
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, status: { control: { enabled: false } } });
    expect(mocks.getReactivationStatus).toHaveBeenCalledWith(adminClient);
  });

  it("não expõe detalhes internos no erro", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true, adminClient: {} });
    mocks.getReactivationStatus.mockRejectedValue(new Error("service-role-key=secret"));
    const response = await GET();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Erro ao consultar o orquestrador." });
  });
});
