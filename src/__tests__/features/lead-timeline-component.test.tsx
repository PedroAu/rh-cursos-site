import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LeadTimeline } from "@/features/admin/leads/timeline/lead-timeline";
import { LEAD_INTERACTION_TYPES, type LeadInteraction } from "@/features/admin/leads/timeline/types";

function events(): LeadInteraction[] {
  return LEAD_INTERACTION_TYPES.map((eventType, index) => ({
    id: `event-${index}`,
    leadId: "lead-1",
    eventType,
    occurredAt: `2026-09-${String(16 - index).padStart(2, "0")}T12:00:00.000Z`,
    recordedAt: "2026-09-16T12:01:00.000Z",
    channel: "EMAIL",
    direction: eventType === "REPLIED" || eventType === "UNSUBSCRIBED" ? "INBOUND" : "OUTBOUND",
    source: eventType === "REPLIED" ? "IMAP" : eventType === "UNSUBSCRIBED" ? "CRM" : "SES",
    safeSummary: `${eventType} com resumo seguro.`,
    externalEventId: `external-${index}`,
    correlationId: "sequence-1",
    causationId: null,
    actorId: "processor",
    actorVersion: "v1",
    contentRef: null,
    contentHash: null,
    metadata: {},
  }));
}

describe("LeadTimeline", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin/leads");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("exibe loading e depois estado vazio sem afetar o restante do detalhe", async () => {
    let resolveFetch!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; })));
    render(<LeadTimeline leadId="lead-1" />);
    expect(screen.getByText("Carregando interações…")).toBeInTheDocument();
    resolveFetch(new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 }));
    expect(await screen.findByText("Este lead ainda não possui interações de e-mail registradas.")).toBeInTheDocument();
  });

  it("renderiza os oito tipos com texto, direção, origem, fuso e auditoria", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: events() }), { status: 200 })));
    render(<LeadTimeline leadId="lead-1" />);
    const list = await screen.findByRole("list", { name: "Interações do lead" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(8);
    for (const label of ["Enviado", "Entregue", "Aberto", "Clicado", "Respondido", "Bounce", "Reclamação", "Descadastro"]) {
      expect(within(list).getByText(label)).toBeInTheDocument();
    }
    expect(within(list).getAllByText(/BRT/).length).toBeGreaterThan(0);
    expect(within(list).getAllByText("Dados de auditoria")).toHaveLength(8);
  });

  it("aplica filtros na consulta, persiste-os na URL e permite limpar", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LeadTimeline leadId="lead-1" />);
    await screen.findByText("Este lead ainda não possui interações de e-mail registradas.");

    fireEvent.click(screen.getByRole("button", { name: "Aberto" }));
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)?.[0]).toContain("types=OPENED"));
    expect(window.location.search).toContain("timelineTypes=OPENED");
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(window.location.search).not.toContain("timelineTypes"));
  });

  it("mostra falha explícita sem esconder dados externos à seção", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    render(<LeadTimeline leadId="lead-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar a linha do tempo.");
    expect(screen.getByText("Os demais dados do lead continuam disponíveis.")).toBeInTheDocument();
  });
});

