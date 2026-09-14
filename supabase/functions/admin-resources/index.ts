// Edge Function: admin-resources
// Substitui app/api/admin/resources/route.ts no deploy estático.
// REC-204 Fase B: a autoridade é EXCLUSIVAMENTE a sessão Supabase SSR
// encaminhada pelo BFF same-origin (`requireTrustedSsrAdmin`). Token HMAC
// legado (`x-rh-session`) não é mais aceito — requisição só com ele → 401.
// Mutações executam com service-role (ignora RLS). Soft-delete via deleted_at.

import { handleOptions, jsonResponse, isOriginAllowed } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { requireTrustedSsrAdmin } from "../_shared/auth.ts";
import { checkRateLimit, clientIp, rateLimitConfigs } from "../_shared/rate-limit.ts";
import { isLockdownActive, LOCKDOWN_RESPONSE_BODY } from "../_shared/lockdown.ts";
import { AdminResourceError, isAdminResourceError } from "../_shared/admin-resource-errors.ts";
import {
  isEnrollmentClassOpen,
  resolveEnrollmentClassIdOrThrow,
} from "../_shared/enrollment-class-resolution.ts";
import {
  blogPostToUpsert,
  classToUpsert,
  courseToUpsert,
  instructorToUpsert,
  resolveUniqueCourseSlug,
  toDbPaymentMethod,
  toDbStudentType,
  toDbEnrollmentStatus,
  toDbLeadStatus,
} from "../_shared/admin-mappers.ts";
import {
  blogPostSchema,
  classSchema,
  courseSchema,
  deleteIdSchema,
  enrollmentCreateSchema,
  enrollmentStatusSchema,
  instructorSchema,
  leadSchema,
  blogDraftSchema,
  leadStatusUpdateSchema,
  studentSchema,
} from "../_shared/admin-validation.ts";
import { normalizeSearchText, resolveUniqueId } from "../_shared/reference-resolution.ts";
import { z } from "https://esm.sh/zod@4.4.3";

type ResourceKey =
  | "courses"
  | "classes"
  | "students"
  | "leads"
  | "enrollments"
  | "instructors"
  | "blog";

type AdminMutation =
  | { resource: ResourceKey; action: "list" }
  | { resource: ResourceKey; action: "create"; payload: Record<string, unknown> }
  | { resource: ResourceKey; action: "upsert"; payload: Record<string, unknown> }
  | { resource: "blog"; action: "save-draft"; payload: Record<string, unknown> }
  | { resource: "blog"; action: "save-content"; payload: Record<string, unknown> }
  | { resource: "blog"; action: "submit-review" | "schedule" | "publish" | "archive" | "restore"; id: string; scheduledAt?: string }
  | { resource: ResourceKey; action: "delete"; id: string }
  | { resource: ResourceKey; action: "update-status"; id: string; status: string };

async function resolveCourseId(supabase: ReturnType<typeof adminClient>, courseReference: string) {
  const { data, error } = await supabase.from("curso").select("id,slug,titulo");
  if (error) throw error;

  return resolveUniqueId(
    data,
    courseReference,
    "Curso",
    [
      (row, rawReference) => row.id === rawReference,
      (row, rawReference) => row.slug === rawReference,
      (row, _rawReference, normalizedReference) =>
        normalizeSearchText(String(row.slug ?? "")) === normalizedReference ||
        normalizeSearchText(String(row.titulo ?? "")) === normalizedReference,
    ],
    (row) => normalizeSearchText(`${row.slug ?? ""} ${row.titulo ?? ""}`)
  );
}

async function resolveCourseIdOrThrow(
  supabase: ReturnType<typeof adminClient>,
  courseReference: string
) {
  return resolveCourseId(supabase, courseReference);
}

async function resolveEnrollmentClassId(
  supabase: ReturnType<typeof adminClient>,
  classReference: string,
  courseReference: string
) {
  const { data: directClassRows, error: directClassError } = await supabase
    .from("turma")
    .select("id,curso_id,status")
    .eq("id", classReference)
    .limit(1);
  if (directClassError) throw directClassError;

  const directClass = directClassRows?.[0];
  if (directClass?.id && isEnrollmentClassOpen(directClass)) {
    return directClass.id as string;
  }

  const resolvedCourseId = await resolveCourseIdOrThrow(supabase, courseReference);
  const { data: courseClasses, error: courseClassesError } = await supabase
    .from("turma")
    .select("id,status")
    .eq("curso_id", resolvedCourseId)
    .in("status", ["Aberta", "PoucasVagas"])
    .order("data_inicio")
    .limit(1);
  if (courseClassesError) throw courseClassesError;

  return resolveEnrollmentClassIdOrThrow({
    directClass: directClass as { id: string; status: string } | null,
    courseClasses: (courseClasses ?? []) as Array<{ id: string; status: string }>,
  });
}

async function resolveInstructorId(
  supabase: ReturnType<typeof adminClient>,
  instructorReference: string
) {
  const { data, error } = await supabase.from("instrutor").select("id,nome");
  if (error) throw error;

  return resolveUniqueId(
    data,
    instructorReference,
    "Instrutor",
    [
      (row, rawReference) => row.id === rawReference,
      (row, _rawReference, normalizedReference) => normalizeSearchText(String(row.nome ?? "")) === normalizedReference,
    ],
    (row) => normalizeSearchText(String(row.nome ?? ""))
  );
}

async function resolveTrilhaNome(supabase: ReturnType<typeof adminClient>, trilhaId: unknown) {
  if (typeof trilhaId !== "string" || trilhaId.length === 0) return null;

  const { data, error } = await supabase.from("trilha").select("nome").eq("id", trilhaId).limit(1);
  if (error) throw error;

  return (data?.[0]?.nome as string | undefined) ?? null;
}

async function resolveCourseSlugForUpsert(
  supabase: ReturnType<typeof adminClient>,
  payload: Record<string, unknown>
) {
  const { data, error } = await supabase
    .from("curso")
    .select("id,slug")
    .is("deleted_at", null);
  if (error) throw error;

  return resolveUniqueCourseSlug(
    typeof payload.slug === "string" ? payload.slug : null,
    typeof payload.title === "string" ? payload.title : null,
    typeof payload.id === "string" ? payload.id : null,
    data
  );
}

function validateMutation(mutation: AdminMutation): string | null {
  try {
    if (mutation.action === "list") return null;

    if (mutation.action === "create") {
      if (mutation.resource === "students") mutation.payload = studentSchema.parse(mutation.payload);
      else if (mutation.resource === "enrollments") mutation.payload = enrollmentCreateSchema.parse(mutation.payload);
      else if (mutation.resource === "leads") mutation.payload = leadSchema.parse(mutation.payload);
      else throw new Error("create action not supported for resource");
      return null;
    }

    if (mutation.action === "delete") {
      deleteIdSchema.parse({ id: mutation.id });
      return null;
    }

    if (mutation.resource === "blog" && mutation.action === "save-draft") {
      const parsed = blogDraftSchema.parse(mutation.payload);
      if (parsed.status !== "Rascunho") return "save-draft só aceita o status Rascunho.";
      mutation.payload = parsed;
      return null;
    }

    if (mutation.resource === "blog" && mutation.action === "save-content") {
      mutation.payload = blogPostSchema.parse(mutation.payload);
      return null;
    }

    if (mutation.resource === "blog" && ["submit-review", "schedule", "publish", "archive", "restore"].includes(mutation.action)) {
      deleteIdSchema.parse({ id: mutation.id });
      if (mutation.action === "schedule") {
        const scheduledAt = z.string().datetime({ offset: true }).parse(mutation.scheduledAt);
        if (new Date(scheduledAt).getTime() <= Date.now()) return "A data de agendamento deve estar no futuro.";
      }
      return null;
    }

    if (mutation.action === "update-status") {
      if (mutation.resource === "leads") leadStatusUpdateSchema.parse({ status: mutation.status });
      if (mutation.resource === "enrollments") enrollmentStatusSchema.parse({ status: mutation.status });
      return null;
    }

    const p = mutation.payload;
    if (mutation.resource === "courses") mutation.payload = courseSchema.parse(p);
    else if (mutation.resource === "classes") mutation.payload = classSchema.parse(p);
    else if (mutation.resource === "students") mutation.payload = studentSchema.parse(p);
    else if (mutation.resource === "leads") mutation.payload = leadSchema.parse(p);
    else if (mutation.resource === "enrollments") enrollmentStatusSchema.parse(p);
    else if (mutation.resource === "instructors") mutation.payload = instructorSchema.parse(p);
    else if (mutation.resource === "blog") mutation.payload = blogPostSchema.parse(p);

    return null;
  } catch (err) {
    if (err && typeof err === "object" && ("issues" in err || "errors" in err)) {
      const issues =
        "issues" in err
          ? (err as { issues: Array<{ message: string; path?: Array<string | number> }> }).issues
          : (err as { errors: Array<{ message: string; path?: Array<string | number> }> }).errors;
      return issues
        .map((issue) => {
          const path = issue.path?.join(".");
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join("; ");
    }
    return "Payload inválido.";
  }
}

async function applyMutation(mutation: AdminMutation, actorId?: string): Promise<{ skipped: boolean; data?: unknown }> {
  const supabase = adminClient();

  if (mutation.action === "list") {
    if (mutation.resource === "leads") {
      const { data, error } = await supabase
        .from("lead")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return { skipped: false, data };
    }
    if (mutation.resource === "blog") {
      const { data, error } = await supabase
        .from("post_blog")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return { skipped: false, data };
    }
    return { skipped: true };
  }

  if (mutation.resource === "blog" && mutation.action === "save-draft") {
    const p = mutation.payload;
    const relatedCourseId = p.relatedCourseId
      ? await resolveCourseId(supabase, String(p.relatedCourseId))
      : undefined;
    const { data, error } = await supabase.from("post_blog").upsert(
      blogPostToUpsert({
        ...p,
        status: "Rascunho",
        summary: String(p.summary ?? "").trim() || "Rascunho em edição",
        content: String(p.content ?? "").trim() || "Rascunho em edição.",
        relatedCourseId: relatedCourseId ?? null,
        atualizadoPor: actorId ?? null,
        criadoPor: actorId ?? null,
      })
    ).select("*").single();
    if (error) throw error;
    return { skipped: false, data };
  }

  if (mutation.resource === "blog" && mutation.action === "save-content") {
    if (!actorId || typeof mutation.payload.id !== "string") {
      throw new AdminResourceError("Post e identidade do operador são obrigatórios.", 422);
    }
    const p = mutation.payload;
    const { data: current, error: currentError } = await supabase
      .from("post_blog")
      .select("id,status,publicado_em,revisao_atual")
      .eq("id", p.id)
      .is("deleted_at", null)
      .single();
    if (currentError) throw currentError;
    if (p.status !== current.status) {
      throw new AdminResourceError("Altere o status usando uma ação editorial específica.", 422);
    }
    const relatedCourseId = p.relatedCourseId
      ? await resolveCourseId(supabase, String(p.relatedCourseId))
      : undefined;
    const update = blogPostToUpsert({
      ...p,
      date: current.publicado_em,
      status: current.status,
      relatedCourseId: relatedCourseId ?? null,
      atualizadoPor: actorId,
    });
    const { data, error } = await supabase.rpc("admin_save_blog_post_content", {
      p_post_id: p.id,
      p_actor_id: actorId,
      p_payload: update,
    });
    if (error) throw error;
    return { skipped: false, data };
  }

  if (mutation.resource === "blog" && ["submit-review", "schedule", "publish", "archive", "restore"].includes(mutation.action)) {
    if (!actorId) throw new AdminResourceError("Identidade do operador ausente.", 401);
    const { data, error } = await supabase.rpc("admin_transition_blog_post", {
      p_post_id: mutation.id,
      p_action: mutation.action,
      p_actor_id: actorId,
      p_scheduled_at: "scheduledAt" in mutation && mutation.scheduledAt ? mutation.scheduledAt : null,
    });
    if (error) {
      const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 422;
      throw new AdminResourceError(error.message, status);
    }
    return { skipped: false, data };
  }

  if (mutation.action === "create") {
    if (mutation.resource === "students") {
      const payload = mutation.payload as Record<string, any>;
      const email = String(payload.email ?? "").trim();
      const { data: existingRows, error: lookupError } = await supabase
        .from("aluno")
        .select("id")
        .ilike("email", email)
        .is("deleted_at", null)
        .limit(1);

      if (lookupError) throw lookupError;

      const existingId = existingRows?.[0]?.id as string | undefined;
      const row = {
        nome_completo: payload.name,
        email: payload.email,
        cpf: payload.cpf ?? null,
        telefone: payload.phone ?? null,
        cargo: payload.jobTitle ?? null,
        orgao: payload.organization ?? null,
        tipo_aluno: toDbStudentType(payload.enrollmentType ?? "Pessoa física"),
      };

    if (existingId) {
        // Existing e-mail identifies the student to reuse; it is not permission
        // to overwrite PII with partial or stale admin-form values.
        return { skipped: false, data: { id: existingId } };
      }

      const { data, error } = await supabase.from("aluno").insert(row).select("id").single();
      if (error) throw error;
      return { skipped: false, data };
    }

    if (mutation.resource === "enrollments") {
      const payload = mutation.payload as Record<string, any>;
      const resolvedClassId = await resolveEnrollmentClassId(
        supabase,
        String(payload.classId ?? ""),
        String(payload.courseId ?? "")
      );
      const { data: enrollmentResult, error } = await supabase.rpc("admin_criar_inscricao", {
        p_nome_completo: payload.studentName,
        p_email: payload.email,
        p_cpf: payload.cpf,
        p_telefone: payload.phone,
        p_cargo: payload.jobTitle,
        p_orgao: payload.organization,
        p_tipo_aluno: toDbStudentType(payload.enrollmentType ?? "Pessoa física"),
        p_turma_id: resolvedClassId,
        p_tipo_inscricao: payload.enrollmentType ?? "Pessoa física",
        p_forma_pagamento: toDbPaymentMethod(payload.paymentMethod ?? "Pix"),
        p_observacoes: payload.notes ?? "",
        p_status: toDbEnrollmentStatus(payload.status ?? "Aguardando pagamento"),
      });
      if (error) throw error;
      return { skipped: false, data: enrollmentResult };
    }

    if (mutation.resource === "leads") {
      const payload = mutation.payload as Record<string, any>;
      const { data, error } = await supabase.from("lead").insert({
        nome: payload.name,
        email: payload.email,
        telefone: payload.phone,
        tipo:
          payload.type === "Consultoria"
            ? "Mentoria"
            : payload.type === "Orçamento"
              ? "Orcamento"
              : payload.type,
        orgao: payload.organization,
        num_participantes: payload.teamSize,
        tema_interesse: payload.courseInterest,
        curso_id: payload.courseId ?? null,
        origem: payload.origin,
        modalidade_preferida: payload.preferredModality,
        objetivo_treinamento: payload.trainingObjective,
        tema_treinamento: payload.trainingTheme,
        desafios_principais: payload.mainChallenges,
        mensagem: payload.message,
        status_crm: "Novo",
      }).select("id,created_at,status_crm").single();
      if (error) throw error;
      return { skipped: false, data };
    }
  }

  if (mutation.action === "delete") {
    const tableByResource: Record<string, string> = {
      courses: "curso",
      classes: "turma",
      students: "aluno",
      instructors: "instrutor",
      blog: "post_blog",
    };
    if (mutation.resource === "leads") {
      const { error } = await supabase
        .from("lead")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", mutation.id);
      if (error) throw error;
      return { skipped: false };
    }

    if (mutation.resource === "enrollments") {
      const { error: deleteError } = await supabase.from("inscricao").delete().eq("id", mutation.id);
      if (deleteError) throw deleteError;
      return { skipped: false };
    }

    const table = tableByResource[mutation.resource];
    if (!table) return { skipped: true };

    if (mutation.resource === "students") {
      const { data: activeEnrollments, error: activeEnrollmentsError } = await supabase
        .from("inscricao")
        .select("id")
        .eq("aluno_id", mutation.id)
        .not("status_inscricao", "in", "(Cancelada,Concluida)")
        .limit(1);
      if (activeEnrollmentsError) throw activeEnrollmentsError;
      if (activeEnrollments?.length) {
        throw new AdminResourceError(
          "Não é possível excluir um aluno com inscrições ativas. Cancele ou conclua as inscrições primeiro.",
          409
        );
      }
    }

    const { error } = await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", mutation.id);
    if (error) throw error;
    return { skipped: false };
  }

  if (mutation.action === "update-status") {
    if (mutation.resource === "leads") {
      const { error } = await supabase
        .from("lead")
        .update({ status_crm: toDbLeadStatus(mutation.status) })
        .eq("id", mutation.id);
      if (error) throw error;
    }
    if (mutation.resource === "enrollments") {
      const { error } = await supabase
        .from("inscricao")
        .update({ status_inscricao: toDbEnrollmentStatus(mutation.status) })
        .eq("id", mutation.id);
      if (error) throw error;
    }
    return { skipped: false };
  }

  // upsert
  const p = mutation.payload;
  if (mutation.resource === "courses") {
    const trilhaNome = await resolveTrilhaNome(supabase, p.pathId);
    const slug = await resolveCourseSlugForUpsert(supabase, p);
    const { data, error } = await supabase.from("curso").upsert(courseToUpsert({ ...p, slug }, trilhaNome ?? "")).select("*").single();
    if (error) throw error;
    return { skipped: false, data };
  } else if (mutation.resource === "classes") {
    const resolvedCourseId = await resolveCourseIdOrThrow(supabase, String(p.courseId ?? ""));
    const resolvedInstructorId = p.instructorId
      ? await resolveInstructorId(supabase, String(p.instructorId ?? ""))
      : undefined;
    const { data, error } = await supabase.from("turma").upsert(
      classToUpsert({
        ...p,
        courseId: resolvedCourseId,
        instructorId: resolvedInstructorId ?? null,
      })
    ).select("*").single();
    if (error) throw error;
    return { skipped: false, data };
  } else if (mutation.resource === "students") {
    const id = String(p.id ?? "");
    if (!id) throw new AdminResourceError("ID do aluno é obrigatório.", 422);
    const update: Record<string, unknown> = {};
    const fields: Array<[string, string]> = [
      ["name", "nome_completo"], ["email", "email"], ["organization", "orgao"],
      ["cpf", "cpf"], ["phone", "telefone"], ["jobTitle", "cargo"], ["enrollmentType", "tipo_aluno"],
    ];
    for (const [source, target] of fields) {
      if (p[source] !== undefined) update[target] = target === "tipo_aluno" ? toDbStudentType(String(p[source])) : p[source];
    }
    const { data, error } = await supabase.from("aluno").update(update).eq("id", id).select("*").single();
    if (error) throw error;
    return { skipped: false, data };
  } else if (mutation.resource === "instructors") {
    const { data, error } = await supabase.from("instrutor").upsert(instructorToUpsert(p)).select("*").single();
    if (error) throw error;
    if (Array.isArray(p.courseIds)) {
      const { error: syncError } = await supabase.rpc("admin_sync_instrutor_cursos", {
        p_instrutor_id: data.id,
        p_curso_ids: p.courseIds,
      });
      if (syncError) throw syncError;
    }
    return { skipped: false, data };
  } else if (mutation.resource === "blog") {
    const relatedCourseId = p.relatedCourseId
      ? await resolveCourseId(supabase, String(p.relatedCourseId))
      : undefined;
    const { data, error } = await supabase.from("post_blog").upsert(
      blogPostToUpsert({
        ...p,
        relatedCourseId: relatedCourseId ?? null,
      })
    ).select("*").single();
    if (error) throw error;
    return { skipped: false, data };
  } else if (mutation.resource === "leads") {
    const update: Record<string, unknown> = {
      nome: p.name,
      email: p.email,
      telefone: p.phone,
      orgao: p.organization,
      num_participantes: p.teamSize,
      tema_interesse: p.courseInterest,
      origem: p.origin,
      modalidade_preferida: p.preferredModality,
      objetivo_treinamento: p.trainingObjective,
      desafios_principais: p.mainChallenges,
      tipo: p.type === "Consultoria" ? "Mentoria" : p.type === "Orçamento" ? "Orcamento" : p.type,
      tema_treinamento: p.trainingTheme,
      curso_id: p.courseId ?? null,
    };
    if (typeof p.status === "string") {
      update.status_crm = toDbLeadStatus(p.status);
    }
    const { data, error } = await supabase
      .from("lead")
      .update(update)
      .eq("id", (p.id as string) ?? "")
      .select("*")
      .single();
    if (error) throw error;
    return { skipped: false, data };
  }

  return { skipped: false };
}

const SENSITIVE_FIELDS = new Set(["cpf", "password", "token", "secret"]);

function sanitizePayloadForAudit(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !SENSITIVE_FIELDS.has(key.toLowerCase()))
  );
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405, request);
  }

  if (isLockdownActive()) {
    return jsonResponse(LOCKDOWN_RESPONSE_BODY, 503, request);
  }

  const origin = request.headers.get("origin");
  if (!isOriginAllowed(origin)) {
    return jsonResponse({ ok: false, error: "Origin not allowed" }, 403, request);
  }

  const session = requireTrustedSsrAdmin(request);
  if (!session) {
    return jsonResponse({ ok: false, error: "Não autorizado." }, 401, request);
  }

  const ip = request.headers.get("x-rh-client-ip") ?? clientIp(request);
  const rate = await checkRateLimit(`admin:${session.email}:${ip}`, rateLimitConfigs.admin);
  if (!rate.allowed) {
    return jsonResponse(
      { ok: false, error: "Muitas requisições. Aguarde um momento." },
      429,
      request,
      { "Retry-After": rate.retryAfter.toString() }
    );
  }

  const mutation = (await request.json().catch(() => null)) as AdminMutation | null;
  if (!mutation?.resource || !mutation?.action) {
    return jsonResponse({ ok: false, error: "Mutação inválida." }, 400, request);
  }

  const validationError = validateMutation(mutation);
  if (validationError) {
    return jsonResponse({ ok: false, error: validationError }, 422, request);
  }

  try {
    const result = await applyMutation(mutation, session.userId);

    // Audit log assíncrono — não bloqueia a resposta nem falha a requisição
    const resourceId =
      mutation.action === "delete" || mutation.action === "update-status"
        ? mutation.id
        : (mutation.payload as Record<string, unknown>)?.id as string | undefined;

    const safePayload =
      mutation.action === "upsert" || mutation.action === "save-draft" || mutation.action === "save-content"
        ? sanitizePayloadForAudit(mutation.payload as Record<string, unknown>)
        : null;

    adminClient()
      .from("admin_audit_log")
      .insert({
        admin_email: session.email,
        action: mutation.action,
        resource: mutation.resource,
        resource_id: resourceId ?? null,
        payload: safePayload,
      })
      .then(({ error }) => {
        if (error) console.warn("audit log insert failed:", error.message);
      });

    return jsonResponse({ ok: true, ...result }, 200, request);
  } catch (error) {
    if (isAdminResourceError(error)) {
      return jsonResponse({ ok: false, error: error.message }, error.status, request);
    }

    console.error("admin-resources error:", error);
    return jsonResponse({ ok: false, error: "Erro ao persistir recurso." }, 500, request);
  }
});
