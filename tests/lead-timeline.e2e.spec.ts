import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import {
  assertSafeWritableIntegrationEnv,
  getIntegrationEnv,
  loginWithSsrSession,
} from "./helpers/integration-env";

const EVENT_LABELS = [
  "Enviado",
  "Entregue",
  "Aberto",
  "Clicado",
  "Respondido",
  "Bounce",
  "Reclamação",
  "Descadastro",
] as const;

const EVENTS = [
  ["SENT", "OUTBOUND", "SES", "Mensagem enviada"],
  ["DELIVERED", "OUTBOUND", "SES", "Mensagem entregue"],
  ["OPENED", "OUTBOUND", "SES", "Mensagem aberta"],
  ["CLICKED", "OUTBOUND", "SES", "Link acessado"],
  ["REPLIED", "INBOUND", "IMAP", "Resposta recebida"],
  ["BOUNCED", "OUTBOUND", "SES", "Entrega rejeitada"],
  ["COMPLAINED", "OUTBOUND", "SES", "Reclamação recebida"],
  ["UNSUBSCRIBED", "INBOUND", "CRM", "Descadastro confirmado"],
].map(([eventType, direction, source, safeSummary], index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  leadId: "lead-e2e",
  eventType,
  occurredAt: `2026-09-${String(16 - index).padStart(2, "0")}T12:00:00.000Z`,
  recordedAt: `2026-09-${String(16 - index).padStart(2, "0")}T12:00:01.000Z`,
  channel: "EMAIL",
  direction,
  source,
  safeSummary,
  externalEventId: `external-${index + 1}`,
  correlationId: "correlation-e2e",
  causationId: null,
  actorId: "playwright",
  actorVersion: "1",
  contentRef: null,
  contentHash: null,
  metadata: {},
}));

async function openFirstLeadTimeline(page: Page) {
  const detailButton = page.getByRole("button", { name: /^Ver detalhes do item / }).first();
  await expect(detailButton).toBeVisible();
  await detailButton.click();
  await expect(page.getByRole("heading", { name: "Linha do tempo" })).toBeVisible();
}

test.describe("CRM — linha do tempo de interações do lead", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await loginWithSsrSession({
      baseURL: baseURL ?? "http://127.0.0.1:3100",
      context,
      email: "e2e-lead-timeline@rhcursos.test",
      name: "E2E Lead Timeline",
      role: "admin",
    });
  });

  test("renderiza os oito eventos, filtra e preserva o filtro após reload no mobile", async ({ page }) => {
    assertSafeWritableIntegrationEnv();
    const leadId = randomUUID();
    const { supabaseUrl, serviceRoleKey } = getIntegrationEnv();
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: seedError } = await supabase.from("lead").insert({
      id: leadId,
      nome: "Lead Timeline E2E",
      email: `timeline-${leadId}@example.com`,
      tipo: "Curso",
      tema_interesse: "Auditoria da Folha de Pagamento",
      origem: "Site",
      status_crm: "Novo",
    });
    if (seedError) throw seedError;

    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.route("**/api/admin/leads/*/timeline?**", async (route) => {
        const types = new URL(route.request().url()).searchParams.get("types")?.split(",") ?? [];
        const data = (types.length ? EVENTS.filter((event) => types.includes(event.eventType)) : EVENTS)
          .map((event) => ({ ...event, leadId }));
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
      });

      await page.goto("/admin/leads");
      await openFirstLeadTimeline(page);

      const timeline = page.getByRole("list", { name: "Interações do lead" });
      for (const label of EVENT_LABELS) {
        await expect(timeline.getByText(label, { exact: true })).toBeVisible();
      }

      await page.getByRole("group", { name: "Filtrar por tipo" }).getByRole("button", { name: "Aberto" }).click();
      await expect(page).toHaveURL(/timelineTypes=OPENED/);
      await expect(timeline.getByText("Aberto", { exact: true })).toBeVisible();
      await expect(timeline.getByText("Enviado", { exact: true })).toHaveCount(0);

      await page.reload();
      await openFirstLeadTimeline(page);
      await expect(page.getByRole("group", { name: "Filtrar por tipo" }).getByRole("button", { name: "Aberto" })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("list", { name: "Interações do lead" }).getByText("Aberto", { exact: true })).toBeVisible();

      const layout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    } finally {
      const { error: cleanupError } = await supabase.from("lead").update({ deleted_at: new Date().toISOString() }).eq("id", leadId);
      if (cleanupError) throw cleanupError;
    }
  });
});
