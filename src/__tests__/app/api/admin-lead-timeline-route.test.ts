import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  listLeadTimeline: vi.fn(),
}));

vi.mock("@/lib/supabase/admin-api-auth", () => ({ requireAdminApi: mocks.requireAdminApi }));
vi.mock("@/features/admin/leads/timeline/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/admin/leads/timeline/server")>();
  return { ...original, listLeadTimeline: mocks.listLeadTimeline };
});
describe("GET /api/admin/leads/[leadId]/timeline", () => {
  beforeEach(() => {
    mocks.requireAdminApi.mockReset();
    mocks.listLeadTimeline.mockReset();
  });

  it("falha fechado sem autorização administrativa e aplica no-store", async () => {
    mocks.requireAdminApi.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false }, { status: 401 }),
    });
    const route = await import("../../../../app/api/admin/leads/[leadId]/timeline/route");
    const response = await route.GET(new Request("https://x/api/admin/leads/lead-1/timeline"), {
      params: Promise.resolve({ leadId: "lead-1" }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.listLeadTimeline).not.toHaveBeenCalled();
  });

  it("valida filtros e consulta somente o lead da rota com ordem do serviço", async () => {
    const adminClient = { from: vi.fn() };
    mocks.requireAdminApi.mockResolvedValue({ ok: true, adminClient });
    mocks.listLeadTimeline.mockResolvedValue([]);
    const route = await import("../../../../app/api/admin/leads/[leadId]/timeline/route");
    const response = await route.GET(
      new Request("https://x/api/admin/leads/lead-1/timeline?types=OPENED,INVALID&from=2026-09-01&to=2026-09-16&limit=999"),
      { params: Promise.resolve({ leadId: "lead-1" }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.listLeadTimeline).toHaveBeenCalledWith(adminClient, "lead-1", {
      types: ["OPENED"],
      from: "2026-09-01",
      to: "2026-09-16",
      limit: 200,
    });
  });

  it("rejeita identificador maior que a PK varchar(80)", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true, adminClient: {} });
    const route = await import("../../../../app/api/admin/leads/[leadId]/timeline/route");
    const response = await route.GET(new Request("https://x/api/admin/leads/x/timeline"), {
      params: Promise.resolve({ leadId: "x".repeat(81) }),
    });
    expect(response.status).toBe(400);
    expect(mocks.listLeadTimeline).not.toHaveBeenCalled();
  });
});
