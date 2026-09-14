import type { DashboardRole } from "@/lib/auth";

export type UserRole = "lead" | DashboardRole;

export type CourseStatus =
  | "Ativo"
  | "Inativo"
  | "Destaque"
  | "Em breve"
  | "Rascunho"
  | "Arquivado";
export type ClassStatus = "Inscrições abertas" | "Poucas vagas" | "Encerrada" | "Em breve";
export type EnrollmentStatus =
  | "Pendente"
  | "Aguardando pagamento"
  | "Confirmada"
  | "Cancelada"
  | "Concluída";
export type LeadStatus = "Novo" | "Em atendimento" | "Proposta enviada" | "Convertido" | "Perdido";
export type BlogStatus = "Rascunho" | "Em revisão" | "Agendado" | "Publicado" | "Arquivado";
export type LeadType = "Curso" | "InCompany" | "Consultoria" | "Newsletter" | "Orçamento" | "Contato";
export type LeadOrigin =
  | "Site"
  | "WhatsApp"
  | "Blog"
  | "Indicação"
  | "LinkedIn"
  | "Consultoria"
  | "Especialista"
  | "Orçamento In Company"
  | "Contato"
  | "Newsletter";

export type TrainingPath = {
  id: string;
  code: string;
  name: string;
  shortName: string;
  slug: string;
  description: string;
  icon: string;
  courseCount: number;
};

export type CourseModule = {
  title: string;
  description: string;
  topics: string[];
  duration: string;
};

export type CoursePublicHighlight = {
  title: string;
  description: string;
};

export type CoursePublicFaqItem = {
  question: string;
  answer: string;
};

export type CoursePublicSidebar = {
  investmentLabel?: string;
  installmentText?: string;
  nextClassesLabel?: string;
  nextClassesEmptyLabel?: string;
  guaranteeTitle?: string;
  guaranteeText?: string;
  supportTitle?: string;
  supportText?: string;
  supportCtaLabel?: string;
  programPdfLabel?: string;
  preEnrollmentLabel?: string;
};

export type CoursePublicCorporateCta = {
  badge?: string;
  title?: string;
  description?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

export type CoursePublicTestimonialOverride = {
  name?: string;
  role?: string;
  organization?: string;
  text?: string;
  rating?: number;
};

export type CoursePublicContent = {
  id: string;
  courseId: string;
  heroSubtitle?: string | null;
  highlights: CoursePublicHighlight[];
  faqItems: CoursePublicFaqItem[];
  sidebar: CoursePublicSidebar;
  corporateCta: CoursePublicCorporateCta;
  testimonialOverride?: CoursePublicTestimonialOverride | null;
  published: boolean;
};

export type Course = {
  id: string;
  slug: string;
  title: string;
  pathId: string;
  pathName: string;
  category?: string;
  categories?: string[];
  modality: "Ao vivo online" | "Presencial" | "In company" | "Híbrido" | "Gravado";
  modalities?: Array<"Ao vivo online" | "Presencial" | "In company" | "Híbrido" | "Gravado">;
  durationLabel: string;
  durationHours: number;
  level: "Básico" | "Intermediário" | "Avançado" | "Básico / Intermediário" | "Básico / Avançado" | "Intermediário / Avançado";
  price: number;
  shortDescription: string;
  fullDescription: string;
  targetAudience: string[];
  objectives: string[];
  benefits: string[];
  modules: CourseModule[];
  instructorId: string;
  image: string;
  rating: number;
  studentsCount: number;
  status: CourseStatus;
  featured: boolean;
  featuredCourseIds?: string[];
  nextClassId: string;
};

export type TrainingClass = {
  id: string;
  courseId: string;
  startDate: string;
  endDate: string;
  time: string;
  modality: Course["modality"];
  location: string;
  instructorId: string;
  totalSeats: number;
  manualFilledSeats?: number;
  filledSeats: number;
  availableSeats: number;
  status: ClassStatus;
  price: number;
  notes: string;
};

export type Student = {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  organization: string;
  jobTitle: string;
  courseId: string;
  classId: string;
  enrollmentStatus: EnrollmentStatus;
  certificateIssued: boolean;
  enrolledAt: string;
  paymentMethod: "Pix" | "Cartão" | "Boleto" | "Empenho" | null;
};

export type Instructor = {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialty: string;
  bio: string;
  education?: string;
  photoUrl?: string;
  courseIds: string[];
  rating: number;
  avatar: string;
  status: "Ativo" | "Inativo";
};

export type Lead = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  type: LeadType;
  courseInterest: string;
  courseId?: string;
  organization?: string;
  teamSize?: number;
  preferredModality?: string;
  trainingObjective?: string;
  trainingTheme?: string;
  mainChallenges?: string;
  origin: LeadOrigin;
  status: LeadStatus;
  message: string;
  createdAt: string;
};

export type Testimonial = {
  id: string;
  name: string;
  role: string;
  organization: string;
  course: string;
  text: string;
  rating: number;
};

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  category:
    | "Licitações"
    | "LGPD"
    | "Compliance"
    | "Departamento Pessoal"
    | "eSocial"
    | "Folha de Pagamento"
    | "Gestão Pública"
    | "Liderança"
    | "Tecnologia"
    | "Assédio e Compliance";
  tags: string[];
  author: string;
  date: string;
  readingTime: string;
  status: BlogStatus;
  image: string;
  imageAlt?: string;
  relatedCourseId: string;
  contentFormat?: "plain" | "markdown";
  scheduledAt?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  ogImageUrl?: string | null;
  revision?: number;
};

export type Enrollment = {
  id: string;
  studentName: string;
  email: string;
  phone: string;
  cpf: string;
  organization: string;
  jobTitle: string;
  enrollmentType: "Pessoa física" | "Empresa" | "Órgão público";
  paymentMethod: "Pix" | "Cartão" | "Boleto" | "Empenho" | null;
  courseId: string;
  classId: string;
  status: EnrollmentStatus;
  createdAt: string;
  notes: string;
};

export type CurrentSession = {
  role: DashboardRole;
  email: string;
  name: string;
};

export type DashboardMetric = {
  label: string;
  value: string | number;
  helper: string;
};
