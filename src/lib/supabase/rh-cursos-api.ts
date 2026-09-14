import { cache } from "react";
import type { Enrollment, Lead } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  publicTestBaselineBlogPosts,
  publicTestBaselineClasses,
  publicTestBaselineCourseCategories,
  publicTestBaselineCoursePublicContents,
  publicTestBaselineCourses,
  publicTestBaselineInstructors,
  publicTestBaselineTrainingPaths
} from "@/lib/public-test-baseline";
import { supabase } from "@/lib/supabase/client";
import { createSupabasePublicServerClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  leadToInsert,
  mapAssessmentToTestimonial,
  mapBlogPost,
  mapClass,
  mapCourse,
  mapCoursePublicContent,
  mapInstructor,
  mapLead,
  mapTrainingPath,
  toDbStudentType,
  type AssessmentWithCourseRow,
  type BlogPostRow,
  type ClassRow,
  type CourseInstructorRow,
  type CoursePublicContentRow,
  type CourseRow,
  type InstructorRow,
  type LeadRow,
  type TrilhaRow
} from "@/lib/supabase/mappers";
import { validateResponse, withRetry } from "@/lib/supabase/api-validation";
import { enrollmentReceiptSchema, enrollmentSchema } from "@/lib/validation";
import {
  assessmentWithCourseListSchema,
  blogPostListSchema,
  courseCategoryListSchema,
  courseInstructorListSchema,
  enrollmentIdSchema,
  leadListSchema,
  leadSchema,
  publicCourseContentListSchema,
  publicClassListSchema,
  publicCourseListSchema,
  publicInstructorListSchema,
  trainingPathListSchema
} from "@/lib/supabase/schemas";

type RhCursosClient = SupabaseClient<Database>;
type CatalogVisibility = "public" | "admin";

type CatalogRows = {
  courses: CourseRow[];
  classes: ClassRow[];
  instructors: InstructorRow[];
  courseInstructors: CourseInstructorRow[];
  coursePublicContents: CoursePublicContentRow[];
};

const PUBLIC_COURSE_STATUSES = new Set(["Ativo", "Destaque", "EmBreve"]);

export class PublicCatalogUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PublicCatalogUnavailableError";
  }
}

type PublicCatalogResult = NonNullable<Awaited<ReturnType<typeof fetchPublicCatalog>>>;

export type PublicCatalogServerState =
  | { status: "ok"; catalog: PublicCatalogResult }
  | { status: "unavailable"; error: PublicCatalogUnavailableError };

/**
 * Replica no processo SSR as relações protegidas pelas políticas RLS públicas.
 *
 * Defesa em profundidade: desde REC-104, o caminho `visibility === "public"`
 * já usa `createSupabasePublicServerClient()` (chave anon), portanto RLS e os
 * grants de coluna de REC-103 já são a barreira ativa nesse caminho. Este
 * filtro em memória permanece como segunda camada, caso uma consulta futura
 * volte, por engano, a apontar para o cliente privilegiado
 * (`createSupabaseServerClient()`, ainda usado pelo caminho `"admin"`).
 */
export function selectCatalogRowsForVisibility(
  rows: CatalogRows,
  visibility: CatalogVisibility
): CatalogRows {
  if (visibility === "admin") return rows;

  const courses = rows.courses.filter((course) => PUBLIC_COURSE_STATUSES.has(course.status));
  const instructors = rows.instructors.filter((instructor) => instructor.status === "Ativo");
  const visibleCourseIds = new Set(courses.map((course) => course.id));
  const visibleInstructorIds = new Set(instructors.map((instructor) => instructor.id));

  return {
    courses,
    instructors,
    classes: rows.classes.filter(
      (trainingClass) =>
        visibleCourseIds.has(trainingClass.curso_id) &&
        (!trainingClass.instrutor_id || visibleInstructorIds.has(trainingClass.instrutor_id))
    ),
    courseInstructors: rows.courseInstructors.filter(
      (relation) =>
        visibleCourseIds.has(relation.curso_id) && visibleInstructorIds.has(relation.instrutor_id)
    ),
    coursePublicContents: rows.coursePublicContents.filter(
      (content) => content.published && visibleCourseIds.has(content.curso_id)
    )
  };
}

function isPlaceholderValue(value: string | undefined) {
  return !value || value.includes("example.supabase.co") || value.includes("placeholder");
}

export const PUBLIC_TEST_BASELINE_STORAGE_KEY = "rh_cursos_public_test_baseline";
export const PUBLIC_TEST_BASELINE_COOKIE_NAME = "rh_cursos_public_test_baseline";

export function isPublicTestBaselineBuildEnabled() {
  return (
    process.env.PLAYWRIGHT_TEST_BUILD === "1" &&
    process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST_BASELINE === "1"
  );
}

export function isServerPublicTestBaselineEnabled(cookieValue: string | undefined) {
  return isPublicTestBaselineBuildEnabled() && cookieValue === "1";
}

export function isExplicitPublicTestBaselineEnabled() {
  if (process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST_BASELINE !== "1" || typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(PUBLIC_TEST_BASELINE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isClientPublicTestBaselineEnabled() {
  if (!isPublicTestBaselineBuildEnabled() || typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((cookie) => cookie.trim() === `${PUBLIC_TEST_BASELINE_COOKIE_NAME}=1`);
}

function shouldUsePublicTestBaseline() {
  return (
    isExplicitPublicTestBaselineEnabled() ||
    isPlaceholderValue(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    isPlaceholderValue(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  );
}

/**
 * Categorias distintas já cadastradas em `curso`, para alimentar as
 * sugestões do combobox de categorias no formulário de cursos (ADR-015 F2).
 * A query é coberta pelo índice parcial `curso_categoria_idx`. Chamada
 * apenas pelo caminho `"admin"` (`fetchAdminCatalogFromSupabaseServer`), que
 * usa `createSupabaseServerClient()` (service role) — o filtro
 * `deleted_at is null` é explícito porque esse cliente não passa pelas
 * políticas RLS aplicadas ao navegador/anon.
 */
export async function fetchCourseCategories(client: RhCursosClient): Promise<string[]> {
  const result = await withRetry(
    () =>
      client
        .from("curso")
        .select("categoria")
        .is("deleted_at", null)
        .not("categoria", "is", null)
        .order("categoria"),
    { label: "fetchPublicCatalog:curso_categoria" }
  );

  if (result.error) throw result.error;

  const rows = validateResponse(result.data, courseCategoryListSchema, {
    endpoint: "fetchCourseCategories",
    resource: "curso_categoria",
    schema: "courseCategoryListSchema"
  });

  const categories = new Set<string>();
  for (const row of rows) {
    if (row.categoria) categories.add(row.categoria);
  }

  return Array.from(categories).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

async function fetchCatalog(
  client: RhCursosClient | null,
  visibility: CatalogVisibility,
  forcePublicTestBaseline = false
) {
  if (visibility === "public" && (forcePublicTestBaseline || shouldUsePublicTestBaseline())) {
    return {
      courses: publicTestBaselineCourses,
      classes: publicTestBaselineClasses,
      instructors: publicTestBaselineInstructors,
      trainingPaths: publicTestBaselineTrainingPaths,
      coursePublicContents: publicTestBaselineCoursePublicContents,
      courseCategories: publicTestBaselineCourseCategories
    };
  }

  if (!client) return null;

  const [
    coursesResult,
    classesResult,
    instructorsResult,
    courseInstructorsResult,
    trainingPathsResult,
    coursePublicContentResult,
    courseCategories
  ] = await Promise.all([
      withRetry(
        () => {
          const query = client
            .from("curso")
            .select("id,titulo,slug,descricao_curta,descricao,ementa,objetivos,beneficios,publico_alvo,carga_horaria,modalidade,modalidades,nivel,categoria,categorias,trilha_id,trilha_nome,preco_base,status,destaque,imagem_capa,rating,total_alunos")
            .is("deleted_at", null);

          return (visibility === "public"
            ? query.in("status", ["Ativo", "Destaque", "EmBreve"])
            : query
          ).order("titulo");
        },
        { label: "fetchPublicCatalog:curso" }
      ),
      withRetry(
        // REC-103: a projeção pública `turma_publica` já embute
        // `deleted_at is null` e não seleciona `observacoes` (nota interna
        // de operação), fechando o vazamento descrito em FND-10.
        () =>
          visibility === "public"
            ? client
                .from("turma_publica")
                .select("id,curso_id,instrutor_id,data_inicio,data_fim,horario,local,vagas_total,vagas_preenchidas,vagas_restantes,preco_turma,modalidade,status")
                .order("data_inicio")
            : client
                .from("turma")
                .select("id,curso_id,instrutor_id,data_inicio,data_fim,horario,local,vagas_total,vagas_preenchidas,vagas_restantes,preco_turma,modalidade,status,observacoes")
                .is("deleted_at", null)
                .order("data_inicio"),
        { label: "fetchPublicCatalog:turma" }
      ),
      withRetry(
        // REC-103: a projeção pública `instrutor_publico` já embute
        // `deleted_at is null and status = 'Ativo'` e não seleciona
        // `email`/`telefone` (contato de instrutor), fechando o vazamento
        // descrito em FND-10.
        () =>
          visibility === "public"
            ? client
                .from("instrutor_publico")
                .select("id,nome,bio,foto_url,formacao,especialidade,rating,status")
                .order("nome")
            : client
                .from("instrutor")
                .select("id,nome,email,telefone,bio,foto_url,formacao,especialidade,rating,status")
                .is("deleted_at", null)
                .order("nome"),
        { label: "fetchPublicCatalog:instrutor" }
      ),
      withRetry(() => client.from("curso_instrutor").select("id,curso_id,instrutor_id,principal"), {
        label: "fetchPublicCatalog:curso_instrutor"
      }),
      withRetry(
        () => {
          const query = client
            .from("trilha")
            .select("id,codigo,nome,nome_curto,slug,descricao,icone,ordem,ativa");

          return (visibility === "public" ? query.eq("ativa", true) : query).order("ordem");
        },
        { label: "fetchPublicCatalog:trilha" }
      ),
      withRetry(
        () => {
          const query = client
            .from("curso_public_content")
            .select("id,curso_id,hero_subtitle,highlights,faq_items,sidebar,corporate_cta,testimonial_override,published,created_at,updated_at,deleted_at")
            .is("deleted_at", null);

          return (visibility === "public" ? query.eq("published", true) : query).order("created_at");
        },
        { label: "fetchPublicCatalog:curso_public_content" }
      ),
      visibility === "admin" ? fetchCourseCategories(client) : Promise.resolve([])
    ]);

  if (coursesResult.error) throw coursesResult.error;
  if (classesResult.error) throw classesResult.error;
  if (instructorsResult.error) throw instructorsResult.error;
  if (courseInstructorsResult.error) throw courseInstructorsResult.error;
  if (trainingPathsResult.error) throw trainingPathsResult.error;

  const courseRows = validateResponse(coursesResult.data, publicCourseListSchema, {
    endpoint: "fetchPublicCatalog",
    resource: "curso",
    schema: "publicCourseListSchema"
  }) as CourseRow[];
  const classRows = validateResponse(classesResult.data, publicClassListSchema, {
    endpoint: "fetchPublicCatalog",
    resource: "turma",
    schema: "publicClassListSchema"
  }) as ClassRow[];
  const instructorRows = validateResponse(instructorsResult.data, publicInstructorListSchema, {
    endpoint: "fetchPublicCatalog",
    resource: "instrutor",
    schema: "publicInstructorListSchema"
  }) as InstructorRow[];
  const courseInstructorRows = validateResponse(courseInstructorsResult.data, courseInstructorListSchema, {
    endpoint: "fetchPublicCatalog",
    resource: "curso_instrutor",
    schema: "courseInstructorListSchema"
  }) as CourseInstructorRow[];
  const trainingPathRows = validateResponse(trainingPathsResult.data, trainingPathListSchema, {
    endpoint: "fetchPublicCatalog",
    resource: "trilha",
    schema: "trainingPathListSchema"
  }) as TrilhaRow[];
  const coursePublicContentRows = coursePublicContentResult.error
    ? []
    : (validateResponse(coursePublicContentResult.data, publicCourseContentListSchema, {
        endpoint: "fetchPublicCatalog",
        resource: "curso_public_content",
        schema: "publicCourseContentListSchema"
      }) as CoursePublicContentRow[]);

  const visibleRows = selectCatalogRowsForVisibility(
    {
      courses: courseRows,
      classes: classRows,
      instructors: instructorRows,
      courseInstructors: courseInstructorRows,
      coursePublicContents: coursePublicContentRows
    },
    visibility
  );
  const resolvedCategories = visibility === "public"
    ? Array.from(
        new Set(visibleRows.courses.flatMap((course) => course.categoria ? [course.categoria] : []))
      ).sort((a, b) => a.localeCompare(b, "pt-BR"))
    : courseCategories;

  // Contagem de cursos por trilha derivada dos dados reais do catálogo, evitando
  // o `courseCount` hardcoded (e propenso a drift) do antigo mock estático.
  const courseCountByPath = visibleRows.courses.reduce<Record<string, number>>((acc, course) => {
    if (course.trilha_id) {
      acc[course.trilha_id] = (acc[course.trilha_id] ?? 0) + 1;
    }
    return acc;
  }, {});

  return {
    courses: visibleRows.courses.map((course) =>
      mapCourse(course, visibleRows.courseInstructors, visibleRows.classes)
    ),
    classes: visibleRows.classes.map(mapClass),
    instructors: visibleRows.instructors.map((instructor) =>
      mapInstructor(instructor, visibleRows.courseInstructors)
    ),
    trainingPaths: trainingPathRows.map((path) => mapTrainingPath(path, courseCountByPath[path.id] ?? 0)),
    coursePublicContents: visibleRows.coursePublicContents.map(mapCoursePublicContent),
    courseCategories: resolvedCategories
  };
}

async function fetchPublicCatalog(client: RhCursosClient | null, forcePublicTestBaseline = false) {
  return fetchCatalog(client, "public", forcePublicTestBaseline);
}

export async function fetchPublicClassesFromSupabase() {
  if (!supabase) return null;
  const client = supabase;

  const result = await withRetry(
    // REC-103: usa a projeção pública `turma_publica` (sem `observacoes`),
    // que já embute `deleted_at is null`.
    () =>
      client
        .from("turma_publica")
        .select("id,curso_id,instrutor_id,data_inicio,data_fim,horario,local,vagas_total,vagas_preenchidas,vagas_restantes,preco_turma,modalidade,status")
        .order("data_inicio"),
    { label: "fetchPublicClasses:turma" }
  );

  if (result.error) throw result.error;

  const rows = validateResponse(result.data, publicClassListSchema, {
    endpoint: "fetchPublicClasses",
    resource: "turma",
    schema: "publicClassListSchema"
  }) as ClassRow[];

  return rows.map(mapClass);
}

async function fetchPublicBlogPosts(client: RhCursosClient | null, forcePublicTestBaseline = false) {
  if (forcePublicTestBaseline || shouldUsePublicTestBaseline()) {
    return publicTestBaselineBlogPosts;
  }

  if (!client) return null;

  const result = await withRetry(
    () =>
      client
        .from("post_blog")
        .select("id,titulo,slug,resumo,conteudo,categoria,tags,autor,publicado_em,tempo_leitura,status,imagem_url,imagem_alt,curso_id,created_at,agendado_em,conteudo_formato,seo_titulo,seo_descricao,canonical_url,og_image_url,revisao_atual")
        .is("deleted_at", null)
        .eq("status", "Publicado")
        .lte("publicado_em", new Date().toISOString())
        .order("publicado_em", { ascending: false }),
    { label: "fetchPublicBlogPosts:post_blog" }
  );

  if (result.error) throw result.error;

  const rows = validateResponse(result.data, blogPostListSchema, {
    endpoint: "fetchPublicBlogPosts",
    resource: "post_blog",
    schema: "blogPostListSchema"
  }) as BlogPostRow[];

  return rows.map(mapBlogPost);
}

export function fetchPublicCatalogFromSupabase() {
  if (
    isExplicitPublicTestBaselineEnabled() ||
    isClientPublicTestBaselineEnabled() ||
    (isPublicTestBaselineBuildEnabled() && shouldUsePublicTestBaseline())
  ) {
    return fetchPublicCatalog(null, true);
  }
  return fetchPublicCatalog(supabase);
}

// Memoizado por request (React cache()): com dynamic = "force-dynamic" nas
// páginas públicas, generateMetadata e o componente de página chamam esta
// função independentemente — sem cache() isso vira 2 round-trips completos
// ao Supabase por view.
export const fetchPublicCatalogFromSupabaseServer = cache(function fetchPublicCatalogFromSupabaseServer(
  usePublicTestBaseline = false
) {
  // REC-104: caminho público usa exclusivamente o cliente anon dedicado —
  // nunca o cliente privilegiado usado pelo caminho admin (FND-03).
  return fetchPublicCatalog(createSupabasePublicServerClient(), usePublicTestBaseline);
});

export const fetchAdminCatalogFromSupabaseServer = cache(function fetchAdminCatalogFromSupabaseServer() {
  return fetchCatalog(createSupabaseServerClient(), "admin");
});

export const fetchPublicCatalogServerState = cache(async function fetchPublicCatalogServerState(
  usePublicTestBaseline = false
): Promise<PublicCatalogServerState> {
  try {
    const catalog = await fetchPublicCatalogFromSupabaseServer(usePublicTestBaseline);
    if (!catalog) {
      throw new PublicCatalogUnavailableError("Supabase indisponível para carregar o catálogo público.");
    }
    return { status: "ok", catalog };
  } catch (error) {
    return {
      status: "unavailable",
      error: error instanceof PublicCatalogUnavailableError
        ? error
        : new PublicCatalogUnavailableError("Não foi possível carregar o catálogo público.", { cause: error })
    };
  }
});

export function fetchPublicBlogPostsFromSupabase() {
  if (
    isExplicitPublicTestBaselineEnabled() ||
    isClientPublicTestBaselineEnabled() ||
    (isPublicTestBaselineBuildEnabled() && shouldUsePublicTestBaseline())
  ) {
    return Promise.resolve(publicTestBaselineBlogPosts);
  }
  return fetchPublicBlogPosts(supabase);
}

export function fetchPublicBlogPostsFromSupabaseServer(usePublicTestBaseline = false) {
  // REC-104: caminho público usa exclusivamente o cliente anon dedicado.
  return fetchPublicBlogPosts(createSupabasePublicServerClient(), usePublicTestBaseline);
}

export async function fetchAdminBlogPostsFromSupabaseServer() {
  const client = createSupabaseServerClient();
  if (!client) return null;

  const result = await withRetry(
    () =>
      client
        .from("post_blog")
        .select("id,titulo,slug,resumo,conteudo,categoria,tags,autor,publicado_em,tempo_leitura,status,imagem_url,imagem_alt,curso_id,created_at,agendado_em,conteudo_formato,seo_titulo,seo_descricao,canonical_url,og_image_url,revisao_atual")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    { label: "fetchAdminBlogPosts:post_blog" }
  );

  if (result.error) throw result.error;

  const rows = validateResponse(result.data, blogPostListSchema, {
    endpoint: "fetchAdminBlogPosts",
    resource: "post_blog",
    schema: "blogPostListSchema"
  }) as BlogPostRow[];

  return rows.map(mapBlogPost);
}

export async function fetchPublicTestimonialsWithClient(client: RhCursosClient) {
  // `avaliacao` has public RLS for published rows, but current migrations do not
  // grant explicit anon Data API access. Keep this isolated from catalog loading.
  const result = await withRetry(
    () =>
      client
        .from("avaliacao")
        .select("id,inscricao_id,turma_id,nota,comentario,publicar,created_at,updated_at,deleted_at,turma(curso(titulo))")
        .is("deleted_at", null)
        .eq("publicar", true)
        .not("comentario", "is", null)
        .order("created_at", { ascending: false }),
    { label: "fetchPublicTestimonials:avaliacao" }
  );

  if (result.error) throw result.error;

  const rows = validateResponse(result.data, assessmentWithCourseListSchema, {
    endpoint: "fetchPublicTestimonials",
    resource: "avaliacao",
    schema: "assessmentWithCourseListSchema"
  }) as AssessmentWithCourseRow[];

  return rows.map(mapAssessmentToTestimonial);
}

export async function fetchPublicTestimonialsFromSupabase() {
  if (!supabase) return null;
  return fetchPublicTestimonialsWithClient(supabase);
}

export async function fetchPublicTestimonialsFromSupabaseServer() {
  // REC-104: caminho público usa exclusivamente o cliente anon dedicado.
  const client = createSupabasePublicServerClient();
  if (!client) return null;
  return fetchPublicTestimonialsWithClient(client);
}

export async function fetchLeadsWithClient(client: RhCursosClient) {
  const result = await withRetry(
    () =>
      client
        .from("lead")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    { label: "fetchLeads:lead" }
  );
  if (result.error) throw result.error;

  const rows = validateResponse(result.data, leadListSchema, {
    endpoint: "fetchLeads",
    resource: "lead",
    schema: "leadListSchema"
  }) as LeadRow[];

  return rows.map(mapLead);
}

export async function createLeadInSupabase(payload: Omit<Lead, "id" | "createdAt" | "status">) {
  if (!supabase) return null;

  const client = supabase;
  const result = await withRetry(() => client.from("lead").insert(leadToInsert(payload)).select("*").single(), {
    label: "createLead:lead"
  });
  if (result.error) throw result.error;

  const row = validateResponse(result.data, leadSchema, {
    endpoint: "createLead",
    resource: "lead",
    schema: "leadSchema"
  }) as LeadRow;

  return mapLead(row);
}

export async function createEnrollmentInSupabase(
  payload: Omit<Enrollment, "id" | "createdAt" | "status" | "paymentMethod">
) {
  const enrollment = enrollmentSchema.parse(payload);
  if (!supabase) return null;

  const client = supabase;
  const result = await withRetry(
    () =>
      client.rpc("registrar_inscricao_publica", {
        p_nome_completo: enrollment.studentName,
        p_email: enrollment.email,
        p_cpf: enrollment.cpf,
        p_telefone: enrollment.phone,
        p_cargo: enrollment.jobTitle,
        p_orgao: enrollment.organization,
        p_tipo_aluno: toDbStudentType(enrollment.enrollmentType),
        p_turma_id: enrollment.classId,
        p_tipo_inscricao: enrollment.enrollmentType,
        p_forma_pagamento: null,
        p_observacoes: enrollment.notes
      }),
    { label: "createEnrollment:registrar_inscricao_publica" }
  );

  if (result.error) throw result.error;

  const enrollmentId = validateResponse(result.data, enrollmentIdSchema, {
    endpoint: "createEnrollment",
    resource: "registrar_inscricao_publica",
    schema: "enrollmentIdSchema"
  });

  const receipt = enrollmentReceiptSchema.parse({
    ok: true,
    enrollmentId,
    classId: enrollment.classId,
  });
  return { enrollmentId: receipt.enrollmentId, classId: receipt.classId };
}
