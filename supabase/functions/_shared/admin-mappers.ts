// Mappers domínio → schema do banco para mutações administrativas.
// Portado de src/lib/supabase/admin-resources.ts (sem dependência de tipos
// gerados — usa shapes leves, já que o runtime Deno não importa database.types).

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export type CourseSlugCandidate = {
  id: string | null;
  slug: string | null;
};

export function resolveUniqueCourseSlug(
  requestedSlug: string | null | undefined,
  title: string | null | undefined,
  currentCourseId: string | null | undefined,
  existingCourses: CourseSlugCandidate[] | null | undefined
): string {
  const baseSlug = slugify(requestedSlug || title || "novo-curso") || "novo-curso";
  const normalizedCurrentId = currentCourseId ?? null;
  const existingSlugs = new Set(
    (existingCourses ?? [])
      .filter((course) => course.id !== normalizedCurrentId)
      .map((course) => course.slug)
      .filter((slug): slug is string => typeof slug === "string" && slug.length > 0)
  );

  if (!existingSlugs.has(baseSlug)) return baseSlug;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${baseSlug}-${suffix}`;
    if (!existingSlugs.has(candidate)) return candidate;
  }

  return `${baseSlug}-${Date.now()}`;
}

type Modality = "Ao vivo online" | "Presencial" | "In company" | "Híbrido" | "Gravado";

export function toDbModality(value: Modality): string {
  const map: Record<Modality, string> = {
    "Ao vivo online": "Online",
    Presencial: "Presencial",
    "In company": "InCompany",
    Híbrido: "Hibrido",
    Gravado: "Gravado",
  };
  return map[value] ?? "Online";
}

function normalizeCourseModalities(p: AnyPayload): Modality[] {
  if (Array.isArray(p.modalities) && p.modalities.length > 0) {
    return p.modalities as Modality[];
  }

  if (typeof p.modality === "string" && p.modality.length > 0) {
    return [p.modality as Modality];
  }

  return ["Ao vivo online"];
}

// ADR-015 Fase 3 (Story ADR015-F3, AC3): `categorias` é o array completo
// enviado pelo admin; `categoria` continua derivado da primeira entrada para
// compatibilidade com leitores legados (também mantido por trigger no banco).
function normalizeCourseCategories(p: AnyPayload): string[] {
  if (Array.isArray(p.categories) && p.categories.length > 0) {
    return p.categories as string[];
  }

  if (typeof p.category === "string" && p.category.length > 0) {
    return [p.category];
  }

  return [];
}

export function toDbLevel(value: string): string {
  if (value === "Avançado" || value.includes("Avançado")) return "Avancado";
  if (value === "Intermediário" || value.includes("Intermediário")) return "Intermediario";
  if (value === "Básico / Intermediário") return "Misto";
  return "Basico";
}

export function toDbCourseStatus(value: string): string {
  const map: Record<string, string> = {
    Ativo: "Ativo",
    Inativo: "Inativo",
    Destaque: "Destaque",
    "Em breve": "EmBreve",
    Rascunho: "Rascunho",
    Arquivado: "Arquivado",
  };
  return map[value] ?? value;
}

export function toDbClassStatus(value: string): string {
  const map: Record<string, string> = {
    "Inscrições abertas": "Aberta",
    "Poucas vagas": "PoucasVagas",
    Encerrada: "Encerrada",
    "Em breve": "EmBreve",
  };
  return map[value] ?? "Aberta";
}

export function toDbLeadStatus(value: string): string {
  const map: Record<string, string> = {
    Novo: "Novo",
    "Em atendimento": "EmAtendimento",
    "Proposta enviada": "PropostaEnviada",
    Convertido: "Convertido",
    Perdido: "Perdido",
  };
  return map[value] ?? "Novo";
}

export function toDbPaymentMethod(value: string): string {
  return value === "Cartão" ? "Cartao" : value;
}

export function toDbStudentType(value: string): string {
  if (value === "Empresa") return "PJ";
  if (value === "Órgão público") return "Servidor";
  return "PF";
}

export function toDbEnrollmentStatus(value: string): string {
  const map: Record<string, string> = {
    Pendente: "Pendente",
    "Aguardando pagamento": "AguardandoPagamento",
    Confirmada: "Confirmada",
    Cancelada: "Cancelada",
    Concluída: "Concluida",
  };
  return map[value] ?? "Pendente";
}

// deno-lint-ignore no-explicit-any
type AnyPayload = Record<string, any>;

// trilhaNome é resolvido pelo servidor a partir de trilha_id (ver
// resolveTrilhaNome em admin-resources/index.ts) — nunca confiar no
// p.pathName do payload do cliente, que pode ficar desatualizado quando o
// form envia um spread do curso antigo (Story 17.4).
export function courseToUpsert(p: AnyPayload, trilhaNome: string): AnyPayload {
  const modalities = normalizeCourseModalities(p);

  const payload: AnyPayload = {
    id: p.id,
    titulo: p.title ?? "Novo curso",
    slug: p.slug ?? slugify(p.title ?? "novo-curso"),
    descricao_curta: p.shortDescription ?? "",
    descricao: p.fullDescription ?? "",
    ementa: p.modules ?? [],
    objetivos: p.objectives ?? [],
    beneficios: p.benefits ?? [],
    publico_alvo: p.targetAudience ?? [],
    carga_horaria: Number.isInteger(p.durationHours) ? p.durationHours : 0,
    modalidade: toDbModality((p.modality as Modality | undefined) ?? modalities[0]),
    modalidades: modalities.map((value) => toDbModality(value)),
    nivel: toDbLevel(p.level ?? "Básico"),
    categoria: p.category ?? p.categories?.[0],
    categorias: normalizeCourseCategories(p),
    trilha_id: p.pathId,
    trilha_nome: trilhaNome,
    preco_base: p.price ?? 0,
    status: toDbCourseStatus(p.status ?? "Ativo"),
    destaque: p.featured ?? false,
    imagem_capa: p.image,
    // rating is derived/managed by the database and never accepted from a form.
  };

  return payload;
}

export function classToUpsert(p: AnyPayload): AnyPayload {
  return {
    id: p.id,
    curso_id: p.courseId ?? "",
    instrutor_id: p.instructorId || null,
    data_inicio: (p.startDate ?? new Date().toISOString()).slice(0, 10),
    data_fim: (p.endDate ?? p.startDate ?? new Date().toISOString()).slice(0, 10),
    horario: p.time,
    local: p.location,
    vagas_total: p.totalSeats ?? 30,
    vagas_preenchidas: p.manualFilledSeats ?? 0,
    preco_turma: p.price ?? 0,
    modalidade: toDbModality(p.modality ?? "Ao vivo online"),
    status: toDbClassStatus(p.status ?? "Inscrições abertas"),
    observacoes: p.notes,
  };
}

export function instructorToUpsert(p: AnyPayload): AnyPayload {
  return {
    id: p.id,
    nome: p.name ?? "Novo instrutor",
    email: p.email,
    telefone: p.phone,
    bio: p.bio,
    foto_url: p.photoUrl,
    formacao: p.education,
    especialidade: p.specialty,
    status: p.status ?? "Ativo",
  };
}

export function blogPostToUpsert(p: AnyPayload): AnyPayload {
  return {
    id: p.id,
    titulo: p.title ?? "Novo post",
    slug: p.slug ?? slugify(p.title ?? "novo-post"),
    resumo: p.summary ?? "Resumo do artigo.",
    conteudo: p.content ?? "Conteúdo do artigo.",
    categoria: p.category ?? "Tecnologia",
    tags: p.tags ?? [],
    autor: p.author ?? "Equipe RH Cursos",
    publicado_em: p.status === "Publicado" ? (p.date ?? new Date().toISOString()) : null,
    agendado_em: p.scheduledAt ?? null,
    tempo_leitura: p.readingTime ?? "5 min",
    status: p.status ?? "Rascunho",
    imagem_url: p.image,
    imagem_alt: p.imageAlt ?? null,
    conteudo_formato: p.contentFormat ?? "plain",
    seo_titulo: p.seoTitle ?? null,
    seo_descricao: p.seoDescription ?? null,
    canonical_url: p.canonicalUrl || null,
    og_image_url: p.ogImageUrl || null,
    curso_id: p.relatedCourseId || null,
    atualizado_por: p.atualizadoPor ?? null,
    criado_por: p.criadoPor ?? null,
  };
}
