import { expect, test } from "@playwright/test";
import {
  assertSafeWritableIntegrationEnv,
  annotateCanonicalDoc,
  cleanupEnrollmentArtifacts,
  createServiceRoleClient,
  createUniqueEmail,
  getCanonicalDocs,
  hasRealIntegrationEnv,
  openAvailableCheckout,
  resolveAvailableCheckoutTarget,
} from "./helpers/integration-env";

function createUniqueCpf() {
  return Date.now().toString().slice(-11).padStart(11, "0");
}

async function fillPersonalForm(
  page: import("@playwright/test").Page,
  email = "carlos@empresa.com.br",
  cpf = "98765432100",
) {
  await page.getByLabel("Nome completo").fill("Carlos Pereira");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Telefone").fill("61999990000");
  await page.getByLabel("CPF").fill(cpf);
}

test.describe("pré-inscrição pública — contrato verdadeiro", () => {
  test("persiste pendente, envia payload mínimo e exibe o recibo real", async ({ page }, testInfo) => {
    test.skip(!hasRealIntegrationEnv(), "Pré-inscrição requer ambiente Supabase real.");
    assertSafeWritableIntegrationEnv();
    test.setTimeout(60_000);
    annotateCanonicalDoc(testInfo, getCanonicalDocs().edgeFunctions);
    const enrollmentEmail = createUniqueEmail("pre-enrollment-e2e");
    const enrollmentCpf = createUniqueCpf();
    const supabase = createServiceRoleClient();

    await cleanupEnrollmentArtifacts(enrollmentEmail);

    try {
      await openAvailableCheckout(page);
      await expect(page.getByRole("heading", { name: "Enviar pré-inscrição" })).toBeVisible();
      await expect(page.getByText("valor de referência")).toBeVisible();
      await expect(page.getByLabel(/número do cartão/i)).toHaveCount(0);
      await expect(page.getByText(/forma de pagamento/i)).toHaveCount(0);

      await fillPersonalForm(page, enrollmentEmail, enrollmentCpf);
      await page.getByRole("button", { name: "Enviar pré-inscrição →" }).click();
      await expect(
        page.getByText("Autorize o uso dos dados e o contato sobre esta solicitação.")
      ).toBeVisible();

      await page.getByText(
        "Autorizo o uso dos dados enviados e o contato sobre esta pré-inscrição."
      ).click();
      const requestPromise = page.waitForRequest(
        (request) => request.method() === "POST" && request.url().endsWith("/api/enrollments"),
      );
      await page.getByRole("button", { name: "Enviar pré-inscrição →" }).click();
      const enrollmentRequest = await requestPromise;
      const requestPayload = enrollmentRequest.postDataJSON() as Record<string, unknown>;

      for (const key of [
        "paymentMethod",
        "cardNumber",
        "cardCvv",
        "cardExpiry",
        "installments",
        "couponCode",
      ]) {
        expect(requestPayload).not.toHaveProperty(key);
      }

      await expect(page).toHaveURL(/\/inscricao-confirmada$/);
      await expect(page.getByText("Pré-inscrição recebida")).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: "Sua solicitação está pendente de análise.",
          exact: true,
        })
      ).toBeVisible();
      expect(page.url()).not.toContain(enrollmentEmail);
      expect(page.url()).not.toContain(enrollmentCpf);

      let studentId: string | null = null;
      await expect
        .poll(async () => {
          const { data, error } = await supabase
            .from("aluno")
            .select("id")
            .ilike("email", enrollmentEmail);
          if (error) throw error;
          studentId = data?.[0]?.id ?? null;
          return studentId ? 1 : 0;
        })
        .toBe(1);

      const { data: enrollments, error } = await supabase
        .from("inscricao")
        .select("id,status_inscricao,status_pagamento,forma_pagamento,codigo_confirmacao")
        .eq("aluno_id", studentId!);
      if (error) throw error;

      expect(enrollments).toHaveLength(1);
      expect(enrollments?.[0]).toMatchObject({
        status_inscricao: "Pendente",
        status_pagamento: "Pendente",
        forma_pagamento: null,
      });
      expect(enrollments?.[0]?.codigo_confirmacao).toMatch(/^[0-9a-f]{16}$/);
      await expect(
        page.getByText(enrollments?.[0]?.codigo_confirmacao ?? "missing-receipt")
      ).toBeVisible();
    } finally {
      await cleanupEnrollmentArtifacts(enrollmentEmail);
    }
  });

  test("falha de persistência preserva os dados e não navega", async ({ page }) => {
    test.skip(!hasRealIntegrationEnv(), "Pré-inscrição requer ambiente Supabase real.");
    await openAvailableCheckout(page);
    await fillPersonalForm(page);
    await page.getByText(
      "Autorizo o uso dos dados enviados e o contato sobre esta pré-inscrição."
    ).click();
    await page.route("**/api/enrollments", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "Pré-inscrição indisponível para teste." }),
      }),
    );

    await page.getByRole("button", { name: "Enviar pré-inscrição →" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: "Pré-inscrição indisponível para teste." })
    ).toBeVisible();
    await expect(page.getByLabel("Nome completo")).toHaveValue("Carlos Pereira");
    await expect(page.getByLabel("E-mail")).toHaveValue("carlos@empresa.com.br");
    await expect(page).toHaveURL(/\/checkout/);
  });

  test("solicitação de empresa exige organização e responsável sem persistir", async ({ page }) => {
    test.skip(!hasRealIntegrationEnv(), "Pré-inscrição requer ambiente Supabase real.");
    await openAvailableCheckout(page);
    await page.getByRole("button", { name: "Empresa" }).click();
    await page.getByLabel("Telefone").fill("61999990000");
    await page.getByLabel("E-mail").fill("contato@empresa.com.br");
    await page.getByLabel("CPF do responsável").fill("98765432100");
    await page.getByText(
      "Autorizo o uso dos dados enviados e o contato sobre esta pré-inscrição."
    ).click();
    let enrollmentRequests = 0;
    await page.route("**/api/enrollments", (route) => {
      enrollmentRequests += 1;
      return route.abort();
    });
    await page.getByRole("button", { name: "Enviar pré-inscrição →" }).click();

    await expect(page.getByText("Informe a organização.")).toBeVisible();
    await expect(page.getByText("Informe o nome do responsável.")).toBeVisible();
    expect(enrollmentRequests).toBe(0);
  });

  test("deeplink legado ?checkout=1 redireciona para a rota dedicada", async ({ page }) => {
    test.skip(!hasRealIntegrationEnv(), "Pré-inscrição requer ambiente Supabase real.");
    const checkoutTarget = await resolveAvailableCheckoutTarget();
    await page.goto(`${checkoutTarget.coursePath}?checkout=1`);
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.getByRole("heading", { name: "Enviar pré-inscrição" })).toBeVisible();
  });

  test("voltar ao curso mantém o usuário no detalhe", async ({ page }) => {
    test.skip(!hasRealIntegrationEnv(), "Pré-inscrição requer ambiente Supabase real.");
    const checkoutTarget = await resolveAvailableCheckoutTarget();
    await page.goto(`${checkoutTarget.coursePath}/checkout`);
    await expect(page.getByRole("heading", { name: "Enviar pré-inscrição" })).toBeVisible();

    await page.getByRole("link", { name: "← Voltar ao curso" }).click();
    await expect(page).toHaveURL(new RegExp(checkoutTarget.coursePath.replace(/[/-]/g, "\\$&")));
  });
});
