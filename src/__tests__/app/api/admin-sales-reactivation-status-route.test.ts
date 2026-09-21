import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  getReactivationStatus: vi.fn(),
}));

vi.mock("@/lib/supabase/admin-api-auth", () => ({ requireAdminApi: mocks.requireAdminApi }));
vi.mock("@/features/sales/reactivation/status", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/sales/reactivation/status")>();
  return { ...actual, getReactivationStatus: mocks.getReactivationStatus };
});

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
    const response = await GET(new Request("https://www.rhcursos.com.br/api/admin/sales/reactivation/status"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.getReactivationStatus).not.toHaveBeenCalled();
  });

  it("retorna somente o status operacional ao admin", async () => {
    const adminClient = { from: vi.fn() };
    mocks.requireAdminApi.mockResolvedValue({ ok: true, adminClient });
    mocks.getReactivationStatus.mockResolvedValue({
      campaign: { key: "prospecting-v1", status: "PAUSED" },
      control: { enabled: false, dryRun: true, killSwitch: true },
      counters: { pendingSteps: 0 },
    });
    const response = await GET(new Request("https://www.rhcursos.com.br/api/admin/sales/reactivation/status"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, status: { control: { enabled: false } } });
    expect(mocks.getReactivationStatus).toHaveBeenCalledWith(adminClient, "prospecting-v1");
  });

  it("permite consultar outra campanha válida explicitamente", async () => {
    const adminClient = { from: vi.fn() };
    mocks.requireAdminApi.mockResolvedValue({ ok: true, adminClient });
    mocks.getReactivationStatus.mockResolvedValue({ campaign: { key: "reactivation-v1" } });

    const response = await GET(new Request(
      "https://www.rhcursos.com.br/api/admin/sales/reactivation/status?campaignKey=reactivation-v1",
    ));

    expect(response.status).toBe(200);
    expect(mocks.getReactivationStatus).toHaveBeenCalledWith(adminClient, "reactivation-v1");
  });

  it("rejeita campaign key inválida sem consultar os dados", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true, adminClient: {} });

    const response = await GET(new Request(
      "https://www.rhcursos.com.br/api/admin/sales/reactivation/status?campaignKey=../../segredo",
    ));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Campanha inválida." });
    expect(mocks.getReactivationStatus).not.toHaveBeenCalled();
  });

  it("rejeita campaign key explicitamente vazia", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true, adminClient: {} });

    const response = await GET(new Request(
      "https://www.rhcursos.com.br/api/admin/sales/reactivation/status?campaignKey=",
    ));

    expect(response.status).toBe(400);
    expect(mocks.getReactivationStatus).not.toHaveBeenCalled();
  });

  it("rejeita espaços externos que não pertencem ao contrato OpenAPI", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true, adminClient: {} });

    const response = await GET(new Request(
      "https://www.rhcursos.com.br/api/admin/sales/reactivation/status?campaignKey=%20prospecting-v1%20",
    ));

    expect(response.status).toBe(400);
    expect(mocks.getReactivationStatus).not.toHaveBeenCalled();
  });

  it("rejeita campaign key com apenas um caractere", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true, adminClient: {} });

    const response = await GET(new Request(
      "https://www.rhcursos.com.br/api/admin/sales/reactivation/status?campaignKey=a",
    ));

    expect(response.status).toBe(400);
    expect(mocks.getReactivationStatus).not.toHaveBeenCalled();
  });

  it("aceita campaign key com dois caracteres", async () => {
    const adminClient = {};
    mocks.requireAdminApi.mockResolvedValue({ ok: true, adminClient });
    mocks.getReactivationStatus.mockResolvedValue({ campaign: { key: "a1" } });

    const response = await GET(new Request(
      "https://www.rhcursos.com.br/api/admin/sales/reactivation/status?campaignKey=a1",
    ));

    expect(response.status).toBe(200);
    expect(mocks.getReactivationStatus).toHaveBeenCalledWith(adminClient, "a1");
  });

  it("aceita o limite de 120 caracteres do contrato", async () => {
    const adminClient = {};
    const campaignKey = `a${"b".repeat(119)}`;
    mocks.requireAdminApi.mockResolvedValue({ ok: true, adminClient });
    mocks.getReactivationStatus.mockResolvedValue({ campaign: { key: campaignKey } });

    const response = await GET(new Request(
      `https://www.rhcursos.com.br/api/admin/sales/reactivation/status?campaignKey=${campaignKey}`,
    ));

    expect(response.status).toBe(200);
    expect(mocks.getReactivationStatus).toHaveBeenCalledWith(adminClient, campaignKey);
  });

  it("rejeita chaves acima de 120 caracteres", async () => {
    const campaignKey = `a${"b".repeat(120)}`;
    mocks.requireAdminApi.mockResolvedValue({ ok: true, adminClient: {} });

    const response = await GET(new Request(
      `https://www.rhcursos.com.br/api/admin/sales/reactivation/status?campaignKey=${campaignKey}`,
    ));

    expect(response.status).toBe(400);
    expect(mocks.getReactivationStatus).not.toHaveBeenCalled();
  });

  it("não expõe detalhes internos no erro", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true, adminClient: {} });
    mocks.getReactivationStatus.mockRejectedValue(new Error("service-role-key=secret"));
    const response = await GET(new Request("https://www.rhcursos.com.br/api/admin/sales/reactivation/status"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Erro ao consultar o orquestrador." });
  });
});
