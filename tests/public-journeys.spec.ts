import { expect, test } from "@playwright/test";
import {
  assertSafeWritableIntegrationEnv,
  cleanupEnrollmentArtifacts,
  createServiceRoleClient,
  createUniqueEmail,
  hasRealIntegrationEnv,
  openAvailableCheckout,
  resolveAvailableTrainingPath,
} from "./helpers/integration-env";
import { getPublicCourseName } from "../src/lib/seo";

const blogArticlePath = "/blog/3-alertas-para-revisar-antes-de-enviar-eventos-do-esocial";

function createUniqueCpf() {
  return Date.now().toString().slice(-11).padStart(11, "0");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

test.describe("epica 4 — jornadas publicas", () => {
  test("home e navegacao deixam as tres jornadas claras sem ocultar descoberta", async ({ page }) => {
    await page.goto("/");
    const mainNav = page.getByRole("navigation", { name: "Navegacao principal" });

    await expect(mainNav).toBeVisible();
    await expect(mainNav.getByRole("link", { name: "Cursos", exact: true })).toBeVisible();
    await expect(mainNav.getByRole("link", { name: "Consultoria", exact: true })).toBeVisible();
    await expect(mainNav.getByRole("link", { name: "In Company", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Fale com um especialista ->" })).toBeVisible();
    await expect(page.getByTestId("ui-hero-home").getByRole("link", { name: "Ver agenda de cursos" })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Escolha como quer avançar" })).toBeVisible();
    await expect(page.getByText("Conteúdo aplicável à legislação vigente e à realidade de organizações públicas e privadas.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cursos abertos" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cursos in-company" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Consultoria" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver agenda de cursos →" })).toHaveAttribute("href", "/agenda");
    await expect(page.getByRole("link", { name: "Levar para minha equipe →" })).toHaveAttribute("href", "/in-company");
    await expect(page.getByRole("link", { name: "Solicitar proposta →" }).first()).toHaveAttribute("href", "/falar-com-especialista");
  });

  test("paginas de jornada reforcam posicionamento regulatorio", async ({ page }) => {
    await page.goto("/cursos");
    await expect(page.getByText("Turmas presenciais e online ao vivo, com certificação e conteúdo atualizado às exigências legais e regulatórias")).toBeVisible();

    await page.goto("/in-company");
    await expect(page.getByText("Desenhamos cada programa a partir das exigências legais que se aplicam ao seu órgão ou empresa e da forma como a sua equipe trabalha.")).toBeVisible();

    await page.goto("/consultoria");
    await expect(page.getByText("Consultoria para aplicar norma com clareza operacional.")).toBeVisible();
    await expect(page.getByText("A RH Cursos apoia equipes públicas e privadas a traduzirem exigências legais e regulatórias em processos claros, treinamento aplicável e execução acompanhada.")).toBeVisible();
  });

  test("catalogo publica curso elegivel sem turma e agenda continua restrita a turmas", async ({ page }) => {
    test.skip(!hasRealIntegrationEnv(), "Smoke real do catalogo requer ambiente Supabase real.");
    assertSafeWritableIntegrationEnv();
    const supabase = createServiceRoleClient();
    const trainingPath = await resolveAvailableTrainingPath();
    const title = `[E2E] ${Date.now()} curso sem turma publica`;
    const slug = `${slugify(title)}-${Date.now()}`;

    const { data: insertedCourse, error: insertError } = await supabase
      .from("curso")
      .insert({
        titulo: title,
        slug,
        descricao_curta: "Curso elegivel sem turma aberto pelo smoke E2E.",
        descricao: "Curso elegivel sem turma para validar publicacao no catalogo sem aparecer na agenda.",
        ementa: [],
        objetivos: [],
        beneficios: [],
        publico_alvo: [],
        carga_horaria: 12,
        modalidade: "Online",
        modalidades: ["Online"],
        nivel: "Basico",
        categoria: trainingPath.name,
        trilha_id: trainingPath.id,
        trilha_nome: trainingPath.name,
        preco_base: 890,
        status: "Ativo",
        destaque: false,
        rating: 0,
        total_alunos: 0,
      })
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    try {
      await page.goto("/cursos");
      const detailsLink = page
        .locator(`a[href="/cursos/${slug}"]`)
        .filter({ hasText: "Ver detalhes →" });
      await expect(page.getByText(getPublicCourseName(title), { exact: true })).toBeVisible();
      await expect(page.getByText("Sem turma aberta").first()).toBeVisible();
      await expect(detailsLink).toHaveText("Ver detalhes →");

      await page.goto("/agenda");
      await expect(page.getByText(title)).toHaveCount(0);
    } finally {
      if (insertedCourse?.id) {
        const { error: deleteError } = await supabase.from("curso").delete().eq("id", insertedCourse.id);
        if (deleteError) {
          throw deleteError;
        }
      }
    }
  });

  test("pré-inscrição valida campos e confirma somente após persistência", async ({ page }) => {
    test.skip(!hasRealIntegrationEnv(), "Jornada pública com pré-inscrição real requer Supabase real.");
    assertSafeWritableIntegrationEnv();
    const enrollmentEmail = createUniqueEmail("public-journey");
    const enrollmentCpf = createUniqueCpf();
    await openAvailableCheckout(page);

    await cleanupEnrollmentArtifacts(enrollmentEmail);

    try {
      await expect(page.getByRole("heading", { name: "Enviar pré-inscrição" })).toBeVisible();
      await page.getByRole("button", { name: "Enviar pré-inscrição →" }).click();

      await expect(page.getByText("Nome deve ter no mínimo 3 caracteres.")).toBeVisible();
      await expect(page.getByText("Informe um e-mail válido.")).toBeVisible();

      await page.getByLabel("Nome completo").fill("Maria Oliveira");
      await page.getByLabel("E-mail").fill(enrollmentEmail);
      await page.getByLabel("Telefone").fill("61999998888");
      await page.getByLabel("CPF").fill(enrollmentCpf);
      await expect(page.getByText("Resumo da pré-inscrição")).toBeVisible();
      await expect(page.getByText("valor de referência")).toBeVisible();
      await page.getByText(
        "Autorizo o uso dos dados enviados e o contato sobre esta pré-inscrição."
      ).click();
      await page.getByRole("button", { name: "Enviar pré-inscrição →" }).click();

      await expect(page).toHaveURL(/\/inscricao-confirmada/);
      await expect(page.getByText("Pré-inscrição recebida")).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: "Sua solicitação está pendente de análise.",
          exact: true,
        })
      ).toBeVisible();
      await expect(page.getByText("Referência", { exact: true })).toBeVisible();
      expect(page.url()).not.toContain(enrollmentEmail);
    } finally {
      await cleanupEnrollmentArtifacts(enrollmentEmail);
    }
  });

  test("contato e in-company exibem confirmação inline após envio", async ({ page }) => {
    assertSafeWritableIntegrationEnv();
    await page.goto("/contato");
    await page.getByLabel("Nome completo").fill("Patricia Lima");
    await page.getByLabel("E-mail").fill("patricia@empresa.com.br");
    await page.getByLabel("Empresa / órgão").fill("Prefeitura Exemplo");
    await page.getByLabel("Curso ou tema de interesse").fill("eSocial");
    await page.getByLabel("Mensagem").fill("Preciso entender quais trilhas atendem uma equipe pública.");
    await page.getByRole("button", { name: "Enviar mensagem" }).click();

    await expect(page.getByText(/Mensagem registrada\./)).toBeVisible();

    await page.goto("/in-company");
    await page.getByLabel("Nome completo").fill("Ana Souza");
    await page.getByLabel("E-mail corporativo").fill("ana@empresa.com.br");
    await page.getByLabel("Telefone ou WhatsApp").fill("61999998888");
    await page.getByPlaceholder("Nome da organização").fill("Secretaria de Gestão");
    await page.getByRole("combobox", { name: /Área de interesse/i }).click();
    await page.getByRole("option", { name: /gestão pública/i }).click();
    await page.getByRole("combobox", { name: /Tamanho da equipe/i }).click();
    await page.getByRole("option", { name: /16 a 40 pessoas/i }).click();
    await page.getByLabel("Objetivo do treinamento").fill("Atualizar a equipe para nova legislação.");
    await page.getByLabel("Tema a ser abordado").fill("eSocial e departamento pessoal.");
    await page.getByLabel("Desafios principais").fill("Reduzir retrabalho e padronizar execução.");
    await page.getByText("Ao enviar, você concorda em ser contatado pela equipe da RH Cursos.").click();
    await page.getByRole("button", { name: "Enviar solicitação de proposta" }).click();

    await expect(page.getByText(/Recebemos os seus dados\./)).toBeVisible();
  });

  test("login exibe o card centralizado sem seleção manual de papel", async ({ page }) => {
    await page.goto("/login?status=required&next=/admin");

    await expect(page.getByRole("heading", { name: "Bem-vindo de volta" })).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    await expect(page.getByLabel("Manter conectado")).toHaveCount(0);
    await expect(page.getByRole("banner")).toHaveCount(0);
  });

  test("sobre e artigo reforçam leitura institucional e taxonomia", async ({ page }) => {
    await page.goto("/sobre");
    await expect(page.getByText("Nossa história")).toBeVisible();
    await expect(page.getByText("Missão, visão e filosofia")).toBeVisible();
    const whatWeDoSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Soluções educacionais integradas" }) });
    await expect(whatWeDoSection.getByText("§", { exact: true })).toBeVisible();
    await expect(whatWeDoSection.getByText("◆", { exact: true })).toBeVisible();
    await expect(whatWeDoSection.getByText("◈", { exact: true })).toBeVisible();

    await page.goto(blogArticlePath);
    const articleBody = await page.locator("body").innerText();
    expect(articleBody).toMatch(/LEITURA GUIADA/i);
    expect(articleBody).toMatch(/TAXONOMIA/i);
  });
});
