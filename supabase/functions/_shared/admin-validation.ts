// Validação server-side dos payloads de mutação admin.
// Espelha src/lib/admin-form-validation.ts mas usa Zod para rejeitar
// requests malformados antes de tocar o banco.
import { z } from "https://esm.sh/zod@4.4.3";

const emailSchema = z.string().min(1, "Email é obrigatório").email("Email inválido");
const adminVarchar240 = (label: string) =>
  z.string().max(240, `${label} não pode ter mais de 240 caracteres`);

const cpfSchema = z
  .string()
  .regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, "CPF deve estar no formato XXX.XXX.XXX-XX")
  .transform((val) => val.replace(/\D/g, ""));

const phoneSchema = z
  .string()
  .regex(
    /^\(\d{2}\)\s\d{4,5}-\d{4}$/,
    "Telefone deve estar no formato (XX) XXXXX-XXXX ou (XX) XXXX-XXXX"
  )
  .transform((val) => val.replace(/\D/g, ""));

const resourceIdSchema = z
  .string()
  .trim()
  .min(1, "ID é obrigatório")
  .max(80, "ID excede o tamanho permitido")
  .regex(/^[A-Za-z0-9_-]+$/, "ID inválido");

const modalityEnum = z.enum([
  "Ao vivo online",
  "Presencial",
  "In company",
  "Híbrido",
  "Gravado",
]);

const courseLevelEnum = z.enum([
  "Básico",
  "Intermediário",
  "Avançado",
  "Básico / Intermediário",
]);

export const courseSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Nome do curso é obrigatório").max(240, "Nome do curso não pode ter mais de 240 caracteres"),
  pathId: z.string().min(1, "Trilha é obrigatória"),
  modality: modalityEnum.optional(),
  modalities: z.array(modalityEnum).min(1, "Selecione pelo menos uma modalidade"),
  level: courseLevelEnum,
  status: z.enum(["Ativo", "Inativo", "Destaque", "Em breve", "Rascunho", "Arquivado"]),
  featured: z.boolean().optional(),
  durationHours: z.number().int().positive("Carga horária deve ser maior que zero"),
  // Compatibilidade durante o rollout: versões antigas da Edge Function ainda
  // exigem o rótulo textual, enquanto o contrato canônico usa horas numéricas.
  durationLabel: z.string().optional(),
  price: z.number({ invalid_type_error: "Preço deve ser um número" }).min(0, "Preço deve ser >= 0"),
  shortDescription: z.string().min(1, "Descrição curta é obrigatória"),
  fullDescription: z.string().min(1, "Descrição completa é obrigatória"),
  image: z.string().optional(),
  targetAudience: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  objectives: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
  modules: z
    .array(
      z.object({
        title: z.string().min(1, "Título do módulo é obrigatório"),
        description: z.string().min(1, "Descrição do módulo é obrigatória"),
        duration: z.string().min(1, "Duração do módulo é obrigatória"),
        topics: z.array(z.string()).min(1, "Módulo deve ter pelo menos um tópico"),
      })
    )
    .optional(),
}).strict();

export const classSchema = z.object({
  id: z.string().optional(),
  courseId: z.string().min(1, "Curso é obrigatório"),
  startDate: z.string().min(1, "Data de início é obrigatória"),
  endDate: z.string().min(1, "Data final é obrigatória"),
  time: z.string().min(1, "Horário é obrigatório"),
  modality: modalityEnum,
  status: z.enum(["Inscrições abertas", "Poucas vagas", "Encerrada", "Em breve"]),
  instructorId: z.string().optional(),
  location: z.string().optional(),
  totalSeats: z.number().int().min(0, "Quantidade de vagas deve ser >= 0"),
  manualFilledSeats: z.number().int().min(0, "Vagas manuais deve ser >= 0").optional(),
  price: z.number({ invalid_type_error: "Preço deve ser um número" }).nonnegative("Preço deve ser >= 0").optional(),
}).strict();

export const studentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nome é obrigatório"),
  email: emailSchema,
  organization: z.string().optional(),
  cpf: z.string().optional(),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  enrollmentType: z.enum(["Pessoa física", "Empresa", "Órgão público"]).optional(),
}).strict();

export const leadSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nome é obrigatório"),
  email: emailSchema,
  phone: z.string().optional(),
  type: z.enum(["Curso", "InCompany", "Consultoria", "Newsletter", "Orçamento", "Contato"]),
  courseInterest: z.string().min(1, "Interesse principal é obrigatório").max(240, "Interesse principal não pode ter mais de 240 caracteres"),
  courseId: z.string().optional(),
  origin: z.enum(["Site", "WhatsApp", "Blog", "Indicação", "LinkedIn", "Consultoria", "Especialista", "Orçamento In Company", "Contato", "Newsletter"]),
  status: z.enum(["Novo", "Em atendimento", "Proposta enviada", "Convertido", "Perdido"]),
  organization: z.string().optional(),
  teamSize: z.number().int().positive().optional(),
  preferredModality: z.string().optional(),
  trainingObjective: z.string().optional(),
  trainingTheme: adminVarchar240("Tema do treinamento").optional(),
  mainChallenges: z.string().optional(),
  message: z.string().optional(),
}).strict();

const enrollmentStatusEnum = z.enum([
  "Pendente",
  "Aguardando pagamento",
  "Confirmada",
  "Cancelada",
  "Concluída",
]);

export const enrollmentStatusSchema = z.object({
  status: enrollmentStatusEnum,
});

export const enrollmentCreateSchema = z.object({
  id: z.string().optional(),
  studentName: z.string().min(3, "Nome deve ter pelo menos 3 caracteres").max(100, "Nome não pode ter mais de 100 caracteres"),
  email: emailSchema,
  cpf: cpfSchema,
  phone: phoneSchema,
  courseId: z.string().min(1, "Curso é obrigatório"),
  classId: z.string().min(1, "Turma é obrigatória"),
  organization: z.string().max(100, "Organização não pode ter mais de 100 caracteres").default(""),
  jobTitle: z.string().max(100, "Cargo não pode ter mais de 100 caracteres").default(""),
  enrollmentType: z.enum(["Pessoa física", "Empresa", "Órgão público"]).default("Pessoa física"),
  paymentMethod: z.enum(["Pix", "Cartão", "Boleto", "Empenho"]).default("Pix"),
  notes: z.string().max(500, "Notas não podem ter mais de 500 caracteres").default(""),
  status: z.enum(["Pendente", "Aguardando pagamento", "Confirmada", "Cancelada", "Concluída"]).optional(),
}).strict();

export const instructorSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.union([z.literal(""), emailSchema]).optional(),
  phone: z.string().optional(),
  specialty: z.string().optional(),
  bio: z.string().optional(),
  education: z.string().optional(),
  photoUrl: z.union([
    z.literal(""),
    z.string().url("Foto deve ser uma URL HTTP(S) válida").refine((value) => /^https?:\/\//i.test(value), "Foto deve usar HTTP(S)"),
  ]).optional(),
  status: z.enum(["Ativo", "Inativo"]),
  courseIds: z.array(z.string()).optional(),
}).strict();

export const blogPostSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Título é obrigatório").max(240, "Título não pode ter mais de 240 caracteres"),
  category: z.enum([
    "Licitações",
    "LGPD",
    "Compliance",
    "Departamento Pessoal",
    "eSocial",
    "Folha de Pagamento",
    "Gestão Pública",
    "Liderança",
    "Tecnologia",
    "Assédio e Compliance",
  ]),
  author: z.string().min(1, "Autor é obrigatório"),
  status: z.enum(["Rascunho", "Em revisão", "Agendado", "Publicado", "Arquivado"]),
  summary: z.string().min(20, "Resumo deve ter pelo menos 20 caracteres"),
  content: z.string().min(100, "Conteúdo deve ter pelo menos 100 caracteres"),
  image: z.string().optional(),
  imageAlt: z.string().max(240, "Texto alternativo não pode ter mais de 240 caracteres").optional(),
  tags: z.array(z.string()).optional(),
  readingTime: z.string().optional(),
  relatedCourseId: z.string().optional(),
  contentFormat: z.enum(["plain", "markdown"]).optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  seoTitle: z.string().max(240, "Título SEO não pode ter mais de 240 caracteres").optional(),
  seoDescription: z.string().max(320, "Descrição SEO não pode ter mais de 320 caracteres").optional(),
  canonicalUrl: z.union([z.literal(""), z.string().url("URL canônica inválida")]).optional(),
  ogImageUrl: z.union([z.literal(""), z.string().url("URL Open Graph inválida")]).optional(),
}).strict();

// Autosave accepts incomplete editorial content. Database defaults keep the
// NOT NULL legacy columns valid until the operator completes publication data.
export const blogDraftSchema = blogPostSchema.extend({
  summary: z.string().max(5000).default(""),
  content: z.string().max(100000).default(""),
}).strict();

export const leadStatusUpdateSchema = z.object({
  status: z.enum(["Novo", "Em atendimento", "Proposta enviada", "Convertido", "Perdido"]),
});

export const deleteIdSchema = z.object({
  id: z.string().min(1, "ID inválido"),
});
