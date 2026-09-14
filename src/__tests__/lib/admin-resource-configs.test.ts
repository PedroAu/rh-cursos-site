import { beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { createAdminStoreFixture } from "../../../tests/fixtures/admin-store";
import { buildResourceConfig, deriveEnrollmentOperationalStatus } from "@/lib/admin-resource-configs";

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

beforeEach(() => {
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
});

test("treats a class end date as inclusive through the end of the local day", () => {
  const store = createAdminStoreFixture();
  const enrollment = { ...store.enrollments[0], status: "Confirmada" as const };
  const trainingClass = {
    ...store.classes[0],
    startDate: "2026-07-10",
    endDate: "2026-07-11",
  };
  const lastMillisecond = new Date(2026, 6, 11, 23, 59, 59, 999).getTime();
  const nextDayStart = new Date(2026, 6, 12, 0, 0, 0, 0).getTime();

  expect(deriveEnrollmentOperationalStatus(enrollment, trainingClass, lastMillisecond)).toBe(
    "Confirmada em turma em andamento."
  );
  expect(deriveEnrollmentOperationalStatus(enrollment, trainingClass, nextDayStart)).toBe(
    "Confirmada em turma encerrada. Revisar conclusão."
  );
});

function createDeps() {
  const noop = () => undefined;
  return {
    search: "",
    editingId: null,
    form: {},
    setForm: noop,
    setEditingId: noop,
    setValidationErrors: noop,
    setOpen: noop,
  };
}

function expectFieldKeys(
  config: { fields: Array<{ key: string }> },
  expectedKeys: string[]
) {
  expect(config.fields.map((field) => field.key)).toEqual(expectedKeys);
}

function expectFieldTypes(
  config: { fields: Array<{ key: string; type?: string }> },
  expectedTypes: Record<string, string>
) {
  for (const [key, type] of Object.entries(expectedTypes)) {
    expect(config.fields.find((field) => field.key === key)?.type).toBe(type);
  }
}

function expectFieldRequired(
  config: { fields: Array<{ key: string; required?: boolean }> },
  expectedRequired: Record<string, boolean>
) {
  for (const [key, required] of Object.entries(expectedRequired)) {
    expect(config.fields.find((field) => field.key === key)?.required).toBe(required);
  }
}

function expectFieldText(
  config: { fields: Array<{ key: string; placeholder?: string; hint?: string }> },
  expected: Record<string, { placeholder?: string; hint?: string }>
) {
  for (const [key, value] of Object.entries(expected)) {
    const field = config.fields.find((item) => item.key === key);
    expect(field?.placeholder).toBe(value.placeholder);
    expect(field?.hint).toBe(value.hint);
  }
}

test("AdminResourcePage configs cover all 7 resource field contracts", () => {
  const store = createAdminStoreFixture();
  const deps = createDeps();
  const editEnrollmentDeps = {
    ...createDeps(),
    editingId: "enrollment-maria",
    form: {
      studentName: "Maria Souza",
      email: "maria.souza@example.com",
      courseTitle: "eSocial Prático",
      classLabel: "10/07/2026 • Ao vivo online",
      createdAtLabel: "11 de jun. de 2026, 10:00",
      paymentMethod: "Pix",
      enrollmentType: "Órgão público",
      derivedStatus: "Confirmada em turma futura.",
      status: "Confirmada",
    },
  };

  const configs = {
    courses: buildResourceConfig("courses", store as never, deps as never),
    classes: buildResourceConfig("classes", store as never, deps as never),
    students: buildResourceConfig("students", store as never, deps as never),
    leads: buildResourceConfig("leads", store as never, deps as never),
    enrollments: buildResourceConfig("enrollments", store as never, deps as never),
    enrollmentsEdit: buildResourceConfig("enrollments", store as never, editEnrollmentDeps as never),
    instructors: buildResourceConfig("instructors", store as never, deps as never),
    blog: buildResourceConfig("blog", store as never, deps as never),
  };

  expectFieldKeys(configs.courses, [
    "title",
    "pathId",
    "modalities",
    "level",
    "status",
    "featured",
    "durationHours",
    "price",
    "image",
    "targetAudience",
    "categories",
    "shortDescription",
    "fullDescription",
    "objectives",
    "benefits",
    "modules",
  ]);
  expectFieldTypes(configs.courses, {
    pathId: "select",
    modalities: "multiselect",
    featured: "select",
    price: "number",
    targetAudience: "array",
    categories: "array",
    shortDescription: "textarea",
    fullDescription: "textarea",
    objectives: "array",
    benefits: "array",
    modules: "modules",
  });
  expectFieldRequired(configs.courses, {
    title: true,
    pathId: true,
    modalities: true,
    level: true,
    status: true,
    featured: false,
    durationHours: true,
    price: true,
    image: false,
    targetAudience: false,
    categories: false,
    shortDescription: true,
    fullDescription: true,
    objectives: false,
    benefits: false,
    modules: false,
  });
  expectFieldText(configs.courses, {
    title: { placeholder: "Ex.: Gestão de contratos administrativos" },
    pathId: { hint: "Define a trilha pública e a classificação do catálogo." },
    modalities: {
      hint: "Selecione todas as modalidades em que o curso pode ser ofertado.",
    },
    level: {
      hint: "Use o nível que melhor representa a profundidade do conteúdo.",
    },
    status: {
      hint: "Ativo, Destaque e Em breve publicam no catálogo; Rascunho e Arquivado ficam ocultos.",
    },
    featured: {
      hint: "Deixe como Não no cadastro inicial, a menos que o curso vá entrar em destaque.",
    },
    durationHours: { placeholder: "Ex.: 16" },
    price: {
      placeholder: "1290",
      hint: "Informe o valor total em reais, sem símbolo de moeda.",
    },
    image: {
      placeholder: "/images/courses/gestao-contratos.jpg",
      hint: "Use uma URL pública ou um caminho do projeto para a capa do curso.",
    },
    targetAudience: {
      placeholder: "Ex.: Gestores públicos",
      hint: "Adicione um público por item, separando perfis relevantes do curso.",
    },
    categories: {
      placeholder: "Ex.: Licitações e Contratos",
      hint: "Use categorias que ajudem a encontrar o curso no catálogo.",
    },
    shortDescription: {
      placeholder: "Ex.: Curso prático para equipes que precisam revisar contratos com segurança.",
    },
    fullDescription: {
      placeholder: "Explique o problema atendido, o que será coberto e o resultado esperado.",
    },
    objectives: {
      placeholder: "Ex.: Reduzir falhas em processos de contratação",
      hint: "Inclua objetivos observáveis e práticos.",
    },
    benefits: {
      placeholder: "Ex.: Material de apoio",
      hint: "Liste os ganhos concretos que o participante terá.",
    },
    modules: {
      hint: "Cada módulo precisa de título, descrição, duração e tópicos.",
    },
  });

  expectFieldKeys(configs.classes, [
    "courseId",
    "startDate",
    "endDate",
    "time",
    "modality",
    "totalSeats",
    "manualFilledSeats",
    "price",
    "status",
    "instructorId",
    "location",
  ]);
  expectFieldTypes(configs.classes, {
    courseId: "select",
    startDate: "date",
    endDate: "date",
    modality: "select",
    totalSeats: "number",
    manualFilledSeats: "number",
    price: "number",
    status: "select",
    instructorId: "select",
  });

  expectFieldKeys(configs.students, ["name", "email", "organization"]);
  expectFieldTypes(configs.students, {
    name: "text",
    email: "text",
    organization: "text",
  });

  expectFieldKeys(configs.leads, [
    "name",
    "email",
    "phone",
    "type",
    "courseInterest",
    "origin",
    "status",
    "organization",
    "teamSize",
    "preferredModality",
    "trainingObjective",
    "trainingTheme",
    "mainChallenges",
  ]);
  expectFieldTypes(configs.leads, {
    type: "select",
    origin: "select",
    status: "select",
    teamSize: "number",
    trainingObjective: "textarea",
    trainingTheme: "textarea",
    mainChallenges: "textarea",
  });

  expectFieldKeys(configs.enrollments, [
    "studentName",
    "email",
    "phone",
    "cpf",
    "organization",
    "jobTitle",
    "enrollmentType",
    "paymentMethod",
    "courseId",
    "classId",
    "notes",
  ]);
  expectFieldTypes(configs.enrollments, {
    studentName: "text",
    email: "text",
    phone: "text",
    cpf: "text",
    organization: "text",
    jobTitle: "text",
    enrollmentType: "select",
    paymentMethod: "select",
    courseId: "select",
    classId: "select",
    notes: "textarea",
  });
  expectFieldKeys(configs.enrollmentsEdit, [
    "studentName",
    "email",
    "courseTitle",
    "classLabel",
    "createdAtLabel",
    "paymentMethod",
    "enrollmentType",
    "derivedStatus",
    "status",
  ]);
  expectFieldTypes(configs.enrollmentsEdit, {
    studentName: "readonly",
    email: "readonly",
    courseTitle: "readonly",
    classLabel: "readonly",
    createdAtLabel: "readonly",
    paymentMethod: "readonly",
    enrollmentType: "readonly",
    derivedStatus: "readonly",
    status: "select",
  });

  expectFieldKeys(configs.instructors, [
    "name",
    "email",
    "phone",
    "specialty",
    "education",
    "photoUrl",
    "bio",
    "courseIds",
    "status",
  ]);
  expectFieldTypes(configs.instructors, {
    name: "text",
    education: "textarea",
    photoUrl: "text",
    bio: "textarea",
    courseIds: "multiselect",
    status: "select",
  });

  expectFieldKeys(configs.blog, [
    "title",
    "category",
    "author",
    "status",
    "summary",
    "content",
    "image",
    "imageAlt",
    "contentFormat",
    "seoTitle",
    "seoDescription",
    "canonicalUrl",
    "ogImageUrl",
    "tags",
    "readingTime",
    "relatedCourseId",
  ]);
  expectFieldTypes(configs.blog, {
    category: "select",
    status: "select",
    summary: "textarea",
    content: "textarea",
    imageAlt: "text",
    contentFormat: "select",
    seoTitle: "text",
    seoDescription: "textarea",
    canonicalUrl: "text",
    ogImageUrl: "text",
    tags: "array",
    relatedCourseId: "select",
  });
});

test("course config matches the canonical catalog presentation and searches categories", () => {
  const store = createAdminStoreFixture();
  const config = buildResourceConfig("courses", store as never, createDeps() as never);

  expect(config.title).toBe("Cursos");
  expect(config.description).toBe("1 curso no catálogo · 1 publicado no site");
  expect(config.primaryActionLabel).toBe("Novo curso");
  expect(config.columns.map((column) => column.label)).toEqual([
    "Curso",
    "Categoria",
    "Modalidade",
    "Carga horária",
    "Turmas ativas",
    "Status",
  ]);
  expect(config.columns.find((column) => column.key === "activeClasses")?.render(store.courses[0] as never)).toBe(1);

  const categorySearchConfig = buildResourceConfig(
    "courses",
    store as never,
    { ...createDeps(), search: "eSocial" } as never
  );
  expect(categorySearchConfig.rows).toHaveLength(1);
});

test("blog config preserves editorial CRUD metadata and searches beyond the title", () => {
  const store = createAdminStoreFixture();
  const config = buildResourceConfig("blog", store as never, createDeps() as never);

  expect(config.title).toBe("Blog");
  expect(config.description).toBe("1 post no acervo · 1 publicado no site");
  expect(config.primaryActionLabel).toBe("Novo post");
  expect(config.columns.map((column) => column.label)).toEqual([
    "Post",
    "Categoria",
    "Autor",
    "Status",
    "Atualização",
  ]);
  expect(config.onDelete).toBeTypeOf("function");
  expect(config.columns.find((column) => column.key === "date")?.render(store.blogPosts[0] as never)).toBe("1 de jun. de 2026");
  expect(config.fields.find((field) => field.key === "category")?.options).toEqual(
    expect.arrayContaining([
      { value: "eSocial", label: "eSocial" },
      { value: "Folha de Pagamento", label: "Folha de Pagamento" },
      { value: "Departamento Pessoal", label: "Departamento Pessoal" },
    ])
  );

  const authorSearch = buildResourceConfig(
    "blog",
    store as never,
    { ...createDeps(), search: "Equipe Synkra" } as never
  );
  expect(authorSearch.rows).toHaveLength(1);

  const categorySearch = buildResourceConfig(
    "blog",
    store as never,
    { ...createDeps(), search: "eSocial" } as never
  );
  expect(categorySearch.rows).toHaveLength(1);
});

test("class config exposes schedule, modality, zero-safe occupancy and instructor", () => {
  const store = createAdminStoreFixture();
  store.classes.push({
    ...store.classes[0],
    id: "class-zero-capacity",
    totalSeats: 0,
    filledSeats: 0,
    availableSeats: 0,
  });
  const config = buildResourceConfig("classes", store as never, createDeps() as never);

  expect(config.title).toBe("Turmas");
  expect(config.primaryActionLabel).toBe("Nova turma");
  expect(config.columns.map((column) => column.label)).toEqual([
    "Turma",
    "Data",
    "Modalidade",
    "Ocupação",
    "Instrutor",
    "Status",
  ]);

  const occupancyColumn = config.columns.find((column) => column.key === "filledSeats");
  expect(occupancyColumn?.exportValue?.(store.classes[1] as never)).toBe("0/0 (0%)");
  render(occupancyColumn?.render(store.classes[1] as never));
  expect(screen.getByRole("progressbar", { name: "Inscritos: 0 de 0" })).toHaveAttribute("aria-valuenow", "0");
  expect(screen.getByText("0/—")).toBeInTheDocument();

  const instructorSearchConfig = buildResourceConfig(
    "classes",
    store as never,
    { ...createDeps(), search: "Ana Lima" } as never
  );
  expect(instructorSearchConfig.rows).toHaveLength(2);
});

test("class form narrows modality options to the selected course modalities", () => {
  const store = createAdminStoreFixture();
  store.courses = [
    {
      ...store.courses[0],
      modalities: ["Presencial", "Ao vivo online"],
      modality: "Presencial",
    },
  ];

  const config = buildResourceConfig(
    "classes",
    store as never,
    {
      ...createDeps(),
      form: { courseId: store.courses[0].id },
    } as never
  );

  const modalityField = config.fields.find((field) => field.key === "modality");
  expect(modalityField?.options).toEqual([
    { value: "Presencial", label: "Presencial" },
    { value: "Ao vivo online", label: "Ao vivo online" },
  ]);
});

test("students follow the canonical table and search name, CPF, or email", () => {
  const store = createAdminStoreFixture();
  const base = buildResourceConfig("students", store as never, createDeps() as never);

  expect(base.title).toBe("Alunos");
  expect(base.primaryActionLabel).toBe("Novo aluno");
  expect(base.columns.map((column) => column.label)).toEqual([
    "Aluno",
    "Organização",
    "Matrículas",
    "Última atividade",
  ]);
  expect(base.columns.find((column) => column.key === "enrollments")?.render(store.students[0])).toBe("1");

  for (const search of ["Maria", "111.222", "souza@example.com"]) {
    const filtered = buildResourceConfig("students", store as never, { ...createDeps(), search } as never);
    expect(filtered.rows.map((row) => row.id)).toEqual(["student-maria"]);
  }
  expect(buildResourceConfig("students", store as never, { ...createDeps(), search: "inexistente" } as never).rows).toEqual([]);
});

test("enrollments expose only supported payment and value data", () => {
  const store = createAdminStoreFixture();
  const config = buildResourceConfig("enrollments", store as never, createDeps() as never);

  expect(config.title).toBe("Pré-inscrições e matrículas");
  expect(config.description).toContain("pré-inscrições e matrículas");
  expect(config.primaryActionLabel).toBe("Nova pré-inscrição");
  expect(config.columns.map((column) => column.label)).toEqual([
    "Aluno",
    "Turma",
    "Inscrição",
    "Pagamento",
    "Valor",
    "Tipo de inscrição",
    "Status",
  ]);
  expect(config.columns.find((column) => column.key === "value")?.render(store.enrollments[0])).toBe("R$ 1.200,00");
  const enrollmentTypeColumn = config.columns.find((column) => column.key === "enrollmentType");
  expect(enrollmentTypeColumn?.render(store.enrollments[0])).toMatchObject({
    props: { children: "Órgão público", "aria-label": "Tipo de inscrição: Órgão público" },
  });
  expect(enrollmentTypeColumn?.exportValue?.(store.enrollments[0])).toBe("Órgão público");
  const editConfig = buildResourceConfig(
    "enrollments",
    store as never,
    { ...createDeps(), editingId: store.enrollments[0].id } as never
  );
  expect(editConfig.fields.find((field) => field.key === "status")?.options?.map((option) => option.label)).toEqual([
    "Pendente",
    "Aguardando pagamento",
    "Confirmada",
    "Cancelada",
    "Concluída",
  ]);
  expect(config.columns.find((column) => column.key === "status")?.render(store.enrollments[0])).toMatchObject({
    props: { children: "Confirmada", "aria-label": "Status: Confirmada" },
  });

  store.classes[0] = { ...store.classes[0], price: 0 };
  store.courses[0] = { ...store.courses[0], price: 0 };
  store.enrollments[0] = { ...store.enrollments[0], paymentMethod: null, enrollmentType: null } as never;
  const unavailable = buildResourceConfig("enrollments", store as never, createDeps() as never);
  expect(unavailable.columns.find((column) => column.key === "value")?.render(store.enrollments[0])).toBe("Informação indisponível");
  expect(unavailable.columns.find((column) => column.key === "paymentMethod")?.render(store.enrollments[0])).toBe("Informação indisponível");
  expect(unavailable.columns.find((column) => column.key === "enrollmentType")?.render(store.enrollments[0])).toMatchObject({
    props: { children: "Informação indisponível" },
  });
});

test("enrollment search includes the type returned by the read model", () => {
  const store = createAdminStoreFixture();
  store.enrollments = store.enrollments.map((enrollment, index) => ({
    ...enrollment,
    enrollmentType: index === 0 ? "Órgão público" : "Empresa",
  }));

  expect(buildResourceConfig("enrollments", store as never, { ...createDeps(), search: "órgão público" } as never).rows)
    .toHaveLength(1);
  expect(buildResourceConfig("enrollments", store as never, { ...createDeps(), search: "empresa" } as never).rows)
    .toHaveLength(1);
});

test("manual lead creation closes only after persistence and emits one success toast", async () => {
  const createLead = vi.fn().mockResolvedValue(undefined);
  const store = { ...createAdminStoreFixture(), createLead };
  const setOpen = vi.fn();
  const setValidationErrors = vi.fn();
  const form = {
    name: "Maria Admin",
    email: "maria.admin@example.com",
    phone: "(61) 99999-8888",
    type: "Contato",
    courseInterest: "Curso Base",
    origin: "Contato",
    status: "Novo",
    message: "Lead criado manualmente no admin.",
  };
  const config = buildResourceConfig(
    "leads",
    store as never,
    {
      ...createDeps(),
      form,
      setOpen,
      setValidationErrors,
    } as never
  );

  await config.onSave();

  expect(createLead).toHaveBeenCalledTimes(1);
  expect(createLead).toHaveBeenCalledWith(expect.objectContaining({
    name: "Maria Admin",
    email: "maria.admin@example.com",
    status: "Novo",
  }));
  expect(setOpen).toHaveBeenCalledTimes(1);
  expect(setOpen).toHaveBeenCalledWith(false);
  expect(setValidationErrors).toHaveBeenCalledWith([]);
  expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
  expect(mocks.toastSuccess).toHaveBeenCalledWith("Lead cadastrado.");
  expect(mocks.toastError).not.toHaveBeenCalled();
});

test("manual lead creation preserves modal data and emits one error when persistence rejects", async () => {
  const createLead = vi.fn().mockRejectedValue(new Error("Supabase indisponível."));
  const store = { ...createAdminStoreFixture(), createLead };
  const setOpen = vi.fn();
  const setValidationErrors = vi.fn();
  const form = {
    name: "Maria Admin",
    email: "maria.admin@example.com",
    phone: "(61) 99999-8888",
    type: "Contato",
    courseInterest: "Curso Base",
    origin: "Contato",
    status: "Novo",
    message: "Lead criado manualmente no admin.",
  };
  const config = buildResourceConfig(
    "leads",
    store as never,
    {
      ...createDeps(),
      form,
      setOpen,
      setValidationErrors,
    } as never
  );

  await config.onSave();

  expect(createLead).toHaveBeenCalledTimes(1);
  expect(setOpen).not.toHaveBeenCalled();
  expect(setValidationErrors).not.toHaveBeenCalled();
  expect(form).toEqual(expect.objectContaining({
    name: "Maria Admin",
    email: "maria.admin@example.com",
    message: "Lead criado manualmente no admin.",
  }));
  expect(mocks.toastError).toHaveBeenCalledTimes(1);
  expect(mocks.toastError).toHaveBeenCalledWith("Erro ao salvar: Supabase indisponível.");
  expect(mocks.toastSuccess).not.toHaveBeenCalled();
});
