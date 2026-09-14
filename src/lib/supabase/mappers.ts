import { courseCoverByPath, defaultCourseCover } from "@/lib/course-covers";
import { modalityDbToLabel, levelDbToLabel, statusDbToLabel } from "@/lib/domain/course-enums";
import { getInitials } from "@/lib/get-initials";
import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  BlogPost,
  ClassStatus,
  Course,
  CourseModule,
  CoursePublicContent,
  CoursePublicCorporateCta,
  CoursePublicFaqItem,
  CoursePublicHighlight,
  CoursePublicSidebar,
  CoursePublicTestimonialOverride,
  CourseStatus,
  Enrollment,
  Instructor,
  Lead,
  Testimonial,
  TrainingClass,
  TrainingPath
} from "@/types";

type Tables = Database["public"]["Tables"];
export type CourseRow = Tables["curso"]["Row"];
export type InstructorRow = Tables["instrutor"]["Row"];
export type CourseInstructorRow = Tables["curso_instrutor"]["Row"];
export type CoursePublicContentRow = Tables["curso_public_content"]["Row"];
export type ClassRow = Tables["turma"]["Row"];
export type LeadRow = Tables["lead"]["Row"];
export type BlogPostRow = Tables["post_blog"]["Row"];
export type AssessmentRow = Tables["avaliacao"]["Row"];
export type StudentInsert = Tables["aluno"]["Insert"];
export type EnrollmentInsert = Tables["inscricao"]["Insert"];
export type LeadInsert = Tables["lead"]["Insert"];
export type TrilhaRow = Tables["trilha"]["Row"];

export type AssessmentWithCourseRow = AssessmentRow & {
  turma?: {
    curso?: {
      titulo?: string | null;
    } | null;
  } | null;
};

const trainingPathNames: Record<string, string> = {
  "path-dp": "Departamento Pessoal",
  "path-gestao": "Gestão Pública",
  "path-licitacoes": "Licitações e Contratos",
  "path-pessoas": "Gestão de Pessoas",
  "path-tech": "Tecnologia e Dados",
  "path-comunicacao": "Comunicação Institucional",
  "path-auditoria": "Auditoria e Controle"
};

export function mapTrainingPath(row: TrilhaRow, courseCount: number): TrainingPath {
  return {
    id: row.id,
    code: row.codigo,
    name: row.nome,
    shortName: row.nome_curto,
    slug: row.slug,
    description: row.descricao,
    icon: row.icone,
    courseCount
  };
}

function asStringArray(value: Json): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asModules(value: Json): CourseModule[] {
  const items: unknown[] = Array.isArray(value) ? value : [];

  return items
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      title: String(item.title ?? item.titulo ?? "Módulo"),
      description: String(item.description ?? item.descricao ?? ""),
      topics: Array.isArray(item.topics)
        ? item.topics.filter((topic: unknown): topic is string => typeof topic === "string")
        : Array.isArray(item.topicos)
          ? item.topicos.filter((topic: unknown): topic is string => typeof topic === "string")
          : [],
      duration: String(item.duration ?? item.duracao ?? "")
    }));
}

function asObjectArray(value: Json): Record<string, unknown>[] {
  const items: unknown[] = Array.isArray(value) ? value : [];

  return items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asPositiveRating(value: unknown): number | undefined {
  const rating = Number(value);
  return Number.isFinite(rating) ? Math.min(Math.max(rating, 1), 5) : undefined;
}

function mapCoursePublicHighlights(value: Json): CoursePublicHighlight[] {
  return asObjectArray(value).map((item) => ({
    title: String(item.title ?? item.titulo ?? ""),
    description: String(item.description ?? item.descricao ?? "")
  }));
}

function mapCoursePublicFaqItems(value: Json): CoursePublicFaqItem[] {
  return asObjectArray(value).map((item) => ({
    question: String(item.question ?? item.pergunta ?? ""),
    answer: String(item.answer ?? item.resposta ?? "")
  }));
}

function mapCoursePublicSidebar(value: Json): CoursePublicSidebar {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;

  return {
    investmentLabel: asString(record.investmentLabel ?? record.investment_label),
    installmentText: asString(record.installmentText ?? record.installment_text),
    nextClassesLabel: asString(record.nextClassesLabel ?? record.next_classes_label),
    nextClassesEmptyLabel: asString(record.nextClassesEmptyLabel ?? record.next_classes_empty_label),
    guaranteeTitle: asString(record.guaranteeTitle ?? record.guarantee_title),
    guaranteeText: asString(record.guaranteeText ?? record.guarantee_text),
    supportTitle: asString(record.supportTitle ?? record.support_title),
    supportText: asString(record.supportText ?? record.support_text),
    supportCtaLabel: asString(record.supportCtaLabel ?? record.support_cta_label),
    programPdfLabel: asString(record.programPdfLabel ?? record.program_pdf_label),
    preEnrollmentLabel: asString(record.preEnrollmentLabel ?? record.pre_enrollment_label)
  };
}

function mapCoursePublicCorporateCta(value: Json): CoursePublicCorporateCta {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;

  return {
    badge: asString(record.badge),
    title: asString(record.title),
    description: asString(record.description),
    primaryLabel: asString(record.primaryLabel ?? record.primary_label),
    primaryHref: asString(record.primaryHref ?? record.primary_href),
    secondaryLabel: asString(record.secondaryLabel ?? record.secondary_label),
    secondaryHref: asString(record.secondaryHref ?? record.secondary_href)
  };
}

function mapCoursePublicTestimonialOverride(value: Json): CoursePublicTestimonialOverride | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (!asString(record.text ?? record.comentario)) {
    return null;
  }

  return {
    name: asString(record.name ?? record.nome),
    role: asString(record.role ?? record.cargo),
    organization: asString(record.organization ?? record.orgao),
    text: asString(record.text ?? record.comentario),
    rating: asPositiveRating(record.rating ?? record.nota)
  };
}

export function toDbModality(value: Course["modality"]): ClassRow["modalidade"] {
  const map: Record<Course["modality"], ClassRow["modalidade"]> = {
    "Ao vivo online": "Online",
    Presencial: "Presencial",
    "In company": "InCompany",
    Híbrido: "Hibrido",
    Gravado: "Gravado"
  };

  return map[value];
}

export function fromDbModality(value: CourseRow["modalidade"]): Course["modality"] {
  return modalityDbToLabel(value);
}

function fromDbModalities(row: CourseRow): Course["modality"][] {
  if (Array.isArray(row.modalidades) && row.modalidades.length > 0) {
    return row.modalidades.map((value) => fromDbModality(value));
  }

  return [fromDbModality(row.modalidade)];
}

// ADR-015 Fase 3 (Story ADR015-F3, AC2): `categorias` é autoritativo; cai
// para `[categoria]` quando `categorias` for nulo/vazio (linhas legadas ainda
// não backfilled ou deploy do mapper antes da migration, AC2/risco de
// sequenciamento documentado na story).
function fromDbCategories(row: CourseRow): string[] {
  if (Array.isArray(row.categorias) && row.categorias.length > 0) {
    return row.categorias;
  }

  return row.categoria ? [row.categoria] : [];
}

function fromDbLevel(value: CourseRow["nivel"]): Course["level"] {
  return levelDbToLabel(value);
}

function fromDbCourseStatus(value: CourseRow["status"]): CourseStatus {
  return statusDbToLabel(value);
}

function fromDbClassStatus(value: ClassRow["status"]): ClassStatus {
  const map: Record<ClassRow["status"], ClassStatus> = {
    Aberta: "Inscrições abertas",
    PoucasVagas: "Poucas vagas",
    Encerrada: "Encerrada",
    Cancelada: "Encerrada",
    Realizada: "Encerrada",
    EmBreve: "Em breve"
  };

  return map[value];
}

export function toDbPaymentMethod(value: Enrollment["paymentMethod"]): EnrollmentInsert["forma_pagamento"] {
  return value === "Cartão" ? "Cartao" : value;
}

export function toDbStudentType(value: Enrollment["enrollmentType"]): StudentInsert["tipo_aluno"] {
  if (value === "Empresa") return "PJ";
  if (value === "Órgão público") return "Servidor";
  return "PF";
}

function fromDbLeadStatus(value: LeadRow["status_crm"]): Lead["status"] {
  const map: Record<LeadRow["status_crm"], Lead["status"]> = {
    Novo: "Novo",
    Contatado: "Em atendimento",
    EmAtendimento: "Em atendimento",
    PropostaEnviada: "Proposta enviada",
    Convertido: "Convertido",
    Perdido: "Perdido"
  };

  return map[value];
}

function fromDbLeadType(value: LeadRow["tipo"]): Lead["type"] {
  const map: Record<LeadRow["tipo"], Lead["type"]> = {
    Curso: "Curso",
    InCompany: "InCompany",
    Mentoria: "Consultoria",
    Newsletter: "Newsletter",
    Orcamento: "Orçamento",
    Contato: "Contato"
  };

  return map[value];
}

function toDbLeadType(value: Lead["type"]): LeadRow["tipo"] {
  const map: Record<Lead["type"], LeadRow["tipo"]> = {
    Curso: "Curso",
    InCompany: "InCompany",
    Consultoria: "Mentoria",
    Newsletter: "Newsletter",
    Orçamento: "Orcamento",
    Contato: "Contato"
  };

  return map[value];
}

function fromDbBlogCategory(value: string): BlogPost["category"] {
  const validCategories: BlogPost["category"][] = [
    "Licitações",
    "LGPD",
    "Compliance",
    "Departamento Pessoal",
    "eSocial",
    "Folha de Pagamento",
    "Gestão Pública",
    "Liderança",
    "Tecnologia",
    "Assédio e Compliance"
  ];

  return validCategories.includes(value as BlogPost["category"])
    ? (value as BlogPost["category"])
    : "Tecnologia";
}

export function mapCourse(row: CourseRow, joins: CourseInstructorRow[], classes: ClassRow[]): Course {
  const courseInstructorRelations = joins
    .filter((item) => item.curso_id === row.id)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  const nextClass = classes
    .filter((item) => item.curso_id === row.id)
    .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))[0];
  // A próxima turma é a fonte mais precisa para o instrutor público. Sem uma
  // turma configurada, usamos o vínculo de instrutor mais recente, evitando
  // que a ordem incidental do retorno do banco defina a página pública.
  const primaryInstructor = courseInstructorRelations[0];
  const modalities = fromDbModalities(row);

  if (!row.trilha_nome && row.trilha_id && !(row.trilha_id in trainingPathNames)) {
    console.warn(`mapCourse: trilha_id "${row.trilha_id}" not found in trainingPathNames map (course ${row.id}).`);
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.titulo,
    pathId: row.trilha_id ?? "path-dp",
    pathName: row.trilha_nome ?? trainingPathNames[row.trilha_id ?? ""] ?? "Cursos",
    category: row.categoria ?? undefined,
    categories: fromDbCategories(row),
    modality: modalities[0] ?? fromDbModality(row.modalidade),
    modalities,
    durationLabel: `${row.carga_horaria}h`,
    durationHours: row.carga_horaria,
    level: fromDbLevel(row.nivel),
    price: Number(row.preco_base),
    shortDescription: row.descricao_curta ?? "",
    fullDescription: row.descricao ?? row.descricao_curta ?? "",
    targetAudience: asStringArray(row.publico_alvo),
    objectives: asStringArray(row.objetivos),
    benefits: asStringArray(row.beneficios),
    modules: asModules(row.ementa),
    instructorId: nextClass?.instrutor_id ?? primaryInstructor?.instrutor_id ?? "",
    image: row.imagem_capa ?? courseCoverByPath[row.trilha_id ?? ""] ?? defaultCourseCover,
    rating: Number(row.rating),
    studentsCount: row.total_alunos,
    status: fromDbCourseStatus(row.status),
    featured: row.destaque || row.status === "Destaque",
    featuredCourseIds: [],
    nextClassId: nextClass?.id ?? ""
  };
}

export function mapCoursePublicContent(row: CoursePublicContentRow): CoursePublicContent {
  return {
    id: row.id,
    courseId: row.curso_id,
    heroSubtitle: row.hero_subtitle,
    highlights: mapCoursePublicHighlights(row.highlights),
    faqItems: mapCoursePublicFaqItems(row.faq_items),
    sidebar: mapCoursePublicSidebar(row.sidebar),
    corporateCta: mapCoursePublicCorporateCta(row.corporate_cta),
    testimonialOverride: mapCoursePublicTestimonialOverride(row.testimonial_override),
    published: row.published
  };
}

export function mapClass(row: ClassRow): TrainingClass {
  return {
    id: row.id,
    courseId: row.curso_id,
    startDate: row.data_inicio,
    endDate: row.data_fim ?? row.data_inicio,
    time: row.horario ?? "",
    modality: fromDbModality(row.modalidade),
    location: row.local ?? "",
    instructorId: row.instrutor_id ?? "",
    totalSeats: row.vagas_total,
    manualFilledSeats: row.vagas_preenchidas,
    filledSeats: row.vagas_preenchidas,
    availableSeats: row.vagas_restantes,
    status: fromDbClassStatus(row.status),
    price: Number(row.preco_turma),
    notes: row.observacoes ?? ""
  };
}

export function mapInstructor(row: InstructorRow, joins: CourseInstructorRow[]): Instructor {
  return {
    id: row.id,
    name: row.nome,
    email: row.email ?? "",
    phone: row.telefone ?? "",
    specialty: row.especialidade ?? "",
    bio: row.bio ?? row.formacao ?? "",
    education: row.formacao ?? "",
    photoUrl: row.foto_url ?? "",
    courseIds: joins.filter((item) => item.instrutor_id === row.id).map((item) => item.curso_id),
    rating: Number(row.rating),
    avatar: row.foto_url ?? getInitials(row.nome),
    status: row.status === "Ativo" ? "Ativo" : "Inativo"
  };
}

export function mapLead(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.nome,
    email: row.email ?? "",
    phone: row.telefone ?? undefined,
    type: fromDbLeadType(row.tipo),
    courseInterest: row.tema_interesse ?? "",
    courseId: row.curso_id ?? undefined,
    organization: row.orgao ?? undefined,
    teamSize: row.num_participantes ?? undefined,
    preferredModality: row.modalidade_preferida ?? undefined,
    trainingObjective: row.objetivo_treinamento ?? undefined,
    trainingTheme: row.tema_treinamento ?? undefined,
    mainChallenges: row.desafios_principais ?? undefined,
    origin: (row.origem as Lead["origin"] | null) ?? "Site",
    status: fromDbLeadStatus(row.status_crm),
    message: row.mensagem ?? "",
    createdAt: row.created_at
  };
}

export function mapBlogPost(row: BlogPostRow): BlogPost {
  const mapped: BlogPost = {
    id: row.id,
    title: row.titulo,
    slug: row.slug,
    summary: row.resumo,
    content: row.conteudo,
    category: fromDbBlogCategory(row.categoria),
    tags: asStringArray(row.tags),
    author: row.autor,
    date: row.publicado_em ?? row.created_at,
    readingTime: row.tempo_leitura ?? "5 min",
    status: row.status,
    image: row.imagem_url ?? "",
    relatedCourseId: row.curso_id ?? "",
  };

  // Mantém compatibilidade com fixtures/integrações legadas que ainda não
  // projetam as colunas editoriais. Quando a coluna existe no read model, ela
  // é exposta normalmente para o editor e para a página pública.
  if (row.imagem_alt != null) mapped.imageAlt = row.imagem_alt;
  if (row.conteudo_formato != null) mapped.contentFormat = row.conteudo_formato === "markdown" ? "markdown" : "plain";
  if (row.agendado_em !== undefined) mapped.scheduledAt = row.agendado_em;
  if (row.seo_titulo !== undefined) mapped.seoTitle = row.seo_titulo ?? null;
  if (row.seo_descricao !== undefined) mapped.seoDescription = row.seo_descricao ?? null;
  if (row.canonical_url !== undefined) mapped.canonicalUrl = row.canonical_url ?? null;
  if (row.og_image_url !== undefined) mapped.ogImageUrl = row.og_image_url ?? null;
  if (row.revisao_atual !== undefined) mapped.revision = row.revisao_atual ?? 1;

  return mapped;
}

export function mapAssessmentToTestimonial(row: AssessmentWithCourseRow): Testimonial {
  return {
    id: row.id,
    name: "Aluno RH Cursos",
    role: "Participante",
    organization: "Turma pública",
    course: row.turma?.curso?.titulo ?? "",
    text: row.comentario ?? "",
    rating: Math.min(Math.max(row.nota, 1), 5)
  };
}

export function leadToInsert(payload: Omit<Lead, "id" | "createdAt" | "status">): LeadInsert {
  return {
    nome: payload.name,
    email: payload.email,
    telefone: payload.phone,
    tipo: toDbLeadType(payload.type),
    orgao: payload.organization,
    num_participantes: payload.teamSize,
    tema_interesse: payload.courseInterest,
    curso_id: payload.courseId,
    origem: payload.origin,
    modalidade_preferida: payload.preferredModality,
    objetivo_treinamento: payload.trainingObjective,
    tema_treinamento: payload.trainingTheme,
    desafios_principais: payload.mainChallenges,
    mensagem: payload.message,
    status_crm: "Novo"
  };
}
