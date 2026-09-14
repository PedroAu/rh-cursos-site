import {
  BookOpen,
  CalendarCheck,
  Clock,
  FileText,
  type LucideIcon,
  Newspaper,
  Tag,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { SeatProgress } from "@/components/admin/seat-progress";
import { UserCell } from "@/components/admin/user-cell";
import { useAppStore } from "@/lib/app-store";
import { parseDate } from "@/lib/utils";
import { toOccupancyPercent } from "@/lib/occupancy";
import {
  COURSE_LEVEL_OPTIONS,
  COURSE_MODALITY_OPTIONS,
  COURSE_STATUS_OPTIONS,
} from "@/lib/domain/course-enums";
import {
  ADMIN_VARCHAR_240_MAX_LENGTH,
  validateBlogPost,
  validateClass,
  validateCourse,
  validateEnrollmentCreate,
  validateEnrollment,
  validateInstructor,
  validateLead,
  validateStudent,
  type ValidationError,
} from "@/lib/admin-form-validation";
import type {
  BlogPost,
  Course,
  CourseModule,
  Enrollment,
  Instructor,
  Lead,
  Student,
  TrainingClass,
  TrainingPath,
} from "@/types";

// O form state genérico (ConfigDeps.form) é Record<string, unknown> — os
// inputs guardam string (text/select/date), number (number) ou string[]
// (array/multiselect). Estes helpers normalizam para o tipo esperado nos
// pontos de leitura, em vez de confiar em `any`.
function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}
function lower(value: unknown): string {
  return String(value ?? "").toLocaleLowerCase("pt-BR");
}
function optStr(value: unknown): string | undefined {
  const result = str(value);
  return result ? result : undefined;
}
function strArr(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}
function deriveCourseCategoriesFromCourses(courses: Course[]): string[] {
  const categories = new Set<string>();
  for (const course of courses) {
    const values = course.categories?.length ? course.categories : course.category ? [course.category] : [];
    for (const value of values) categories.add(value);
  }
  return Array.from(categories).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
function numOrUndef(value: unknown): number | undefined {
  if (value === "" || value === undefined || value === null) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}
function resolveDurationHours(course: Course): number {
  if (Number.isFinite(course.durationHours) && course.durationHours > 0) {
    return course.durationHours;
  }

  const legacyHours = Number.parseFloat(course.durationLabel.match(/[-+]?[\d,.]+/)?.[0]?.replace(",", ".") ?? "");
  return Number.isFinite(legacyHours) && legacyHours > 0 ? legacyHours : 0;
}
function modulesArr(value: unknown): CourseModule[] {
  return Array.isArray(value) ? (value as CourseModule[]) : [];
}

export type ResourceKey =
  | "courses"
  | "classes"
  | "students"
  | "leads"
  | "enrollments"
  | "instructors"
  | "blog";

export type FieldConfig = {
  key: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "select"
    | "array"
    | "modules"
    | "multiselect"
    | "number"
    | "date"
    | "file"
    | "readonly";
  options?: Array<{ value: string; label: string }>;
  /** Sugestões (datalist) para campos `type: "array"` — não restringe, só orienta. */
  suggestions?: string[];
  placeholder?: string;
  hint?: string;
  required?: boolean;
  maxLength?: number;
  section?: string;
};

export type ColumnConfig<T> = {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  /** Valor textual usado no export CSV quando `render` produz markup composto. */
  exportValue?: (row: T) => string;
};

export type ResourceStat = {
  label: string;
  value: string;
  helper: string;
  icon?: LucideIcon;
};

export type ResourceConfig = {
  title: string;
  description: string;
  primaryActionLabel?: string;
  rows: Array<{ id: string }>;
  /** Stats bento opcionais — substituem os cards genéricos quando presentes. */
  stats?: ResourceStat[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnConfig<any>[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onEdit: (row: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDelete?: (row: any) => void;
  onSave: () => Promise<void>;
  fields: FieldConfig[];
};

type ConfigDeps = {
  search: string;
  editingId: string | null;
  form: Record<string, unknown>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  setEditingId: (id: string | null) => void;
  setValidationErrors: (errors: ValidationError[]) => void;
  setOpen: (open: boolean) => void;
};

import React from "react";

function normalizeDateForStorage(value?: string) {
  // `turma.data_inicio`/`data_fim` are PostgreSQL `date` columns. Keep these
  // values date-only; appending a UTC time makes the browser reinterpret the
  // business date in the user's timezone and can display the previous day.
  if (!value) return new Date().toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function formatAdminDate(value?: string) {
  if (!value) return "—";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatDateOnlyPtBR(value);
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatEditorialDate(value?: string) {
  if (!value) return "—";

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly ? new Date(`${value}T12:00:00`) : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}

function formatDateOnlyPtBR(value?: string) {
  if (!value) return "—";

  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (!dateOnly) return formatEditorialDate(value);

  const [, year, month, day] = dateOnly;
  const date = new Date(`${year}-${month}-${day}T12:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

function isWithinLastDays(value: string, days: number, now = Date.now()) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;

  const elapsed = now - timestamp;
  return elapsed >= 0 && elapsed <= days * 24 * 60 * 60 * 1000;
}

function getBadgeVariant(value: string) {
  if (
    value === "Confirmada" ||
    value === "Concluída" ||
    value === "Ativo" ||
    value === "Publicado" ||
    value === "Convertido" ||
    value === "Inscrições abertas"
  ) {
    return "success" as const;
  }

  if (
    value === "Aguardando pagamento" ||
    value === "Poucas vagas" ||
    value === "Em atendimento" ||
    value === "Em breve"
  ) {
    return "warning" as const;
  }

  if (
    value === "Cancelada" ||
    value === "Inativo" ||
    value === "Arquivado" ||
    value === "Perdido" ||
    value === "Encerrada"
  ) {
    return "danger" as const;
  }

  return "muted" as const;
}

function renderStatusBadge(value: string) {
  return <Badge variant={getBadgeVariant(value)} aria-label={`Status: ${value}`}>{value}</Badge>;
}

export function deriveEnrollmentOperationalStatus(
  enrollment: Enrollment,
  trainingClass?: TrainingClass,
  now = Date.now()
) {
  if (enrollment.status === "Cancelada") return "Cancelada pelo atendimento.";
  if (enrollment.status === "Concluída") return "Concluída e pronta para pós-curso.";

  if (!trainingClass) {
    return `${enrollment.status} com turma não localizada.`;
  }

  const startsAt = parseDate(trainingClass.startDate).getTime();
  const endDate = parseDate(trainingClass.endDate);
  endDate.setHours(23, 59, 59, 999);
  const endsAt = endDate.getTime();

  if (enrollment.status === "Confirmada") {
    if (endsAt < now) return "Confirmada em turma encerrada. Revisar conclusão.";
    if (startsAt <= now) return "Confirmada em turma em andamento.";
    return "Confirmada para turma futura.";
  }

  if (enrollment.status === "Aguardando pagamento") {
    if (startsAt <= now) return "Pagamento pendente com turma em andamento.";
    return "Pagamento pendente antes do início da turma.";
  }

  if (enrollment.status === "Pendente") {
    if (startsAt <= now) return "Aguardando confirmação com turma ativa.";
    return "Aguardando confirmação comercial.";
  }

  return enrollment.status;
}

export function buildResourceConfig(
  resource: ResourceKey,
  store: ReturnType<typeof useAppStore>,
  deps: ConfigDeps
): ResourceConfig {
  const { search, editingId, form, setForm, setEditingId, setValidationErrors, setOpen } = deps;

  switch (resource) {
    case "courses": {
      const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
      const rows = store.courses.filter((item) => {
        const categories = item.categories?.length
          ? item.categories
          : item.category
            ? [item.category]
            : [];
        return [item.title, item.pathName, ...categories]
          .filter(Boolean)
          .some((value) => lower(value).includes(normalizedSearch));
      });
      // The admin SSR catalog normally supplies `trainingPaths`. During a
      // transient catalog refresh, preserve paths already referenced by the
      // loaded courses instead of rendering an empty select and forcing the
      // operator to abandon the form.
      const pathOptions = Array.from(
        new Map(
          [
            ...(store.trainingPaths ?? []).map((path: TrainingPath) => ({ value: path.id, label: path.name })),
            ...store.courses
              .filter((course) => course.pathId && course.pathName)
              .map((course) => ({ value: course.pathId, label: course.pathName }))
          ].map((option) => [option.value, option] as const)
        ).values()
      );
      const categoryOptions =
        store.courseCategories?.length
          ? store.courseCategories
          : deriveCourseCategoriesFromCourses(store.courses);
      const modalityOptions = COURSE_MODALITY_OPTIONS;
      const statusOptions = COURSE_STATUS_OPTIONS;

      const activeCourses = store.courses.filter((item) => item.status === "Ativo" || item.status === "Destaque").length;
      const enrolledStudents = store.students.length;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const upcomingClasses = store.classes.filter((item) => {
        const startsAt = parseDate(item.startDate).getTime();
        return startsAt >= todayStart.getTime();
      }).length;
      const completedEnrollments = store.enrollments.filter((item) => item.status === "Concluída").length;
      const totalEnrollments = store.enrollments.length;
      const completionRate = totalEnrollments > 0 ? Math.round((completedEnrollments / totalEnrollments) * 100) : 0;

      return {
        title: "Cursos",
        description: `${store.courses.length} ${store.courses.length === 1 ? "curso" : "cursos"} no catálogo · ${activeCourses} ${activeCourses === 1 ? "publicado" : "publicados"} no site`,
        primaryActionLabel: "Novo curso",
        rows,
        stats: [
          {
            label: "Cursos ativos",
            value: String(activeCourses),
            helper: "Cursos com status Ativo ou Destaque.",
            icon: BookOpen,
          },
          {
            label: "Alunos matriculados",
            value: String(enrolledStudents),
            helper: "Alunos com ao menos uma inscrição.",
            icon: Users,
          },
          {
            label: "Turmas futuras",
            value: String(upcomingClasses),
            helper: "Turmas com início agendado.",
            icon: CalendarCheck,
          },
          {
            label: "Taxa de conclusão",
            value: `${completionRate}%`,
            helper: "Inscrições concluídas sobre o total.",
            icon: TrendingUp,
          },
        ],
        columns: [
          { key: "title", label: "Curso", render: (row: Course) => row.title },
          {
            key: "category",
            label: "Categoria",
            render: (row: Course) => row.categories?.[0] ?? row.category ?? row.pathName ?? "—",
          },
          { key: "modality", label: "Modalidade", render: (row: Course) => <Badge variant="muted">{row.modality}</Badge> },
          { key: "durationLabel", label: "Carga horária", render: (row: Course) => row.durationLabel || `${row.durationHours}h` },
          {
            key: "activeClasses",
            label: "Turmas ativas",
            render: (row: Course) => store.classes.filter(
              (trainingClass) => trainingClass.courseId === row.id &&
                (trainingClass.status === "Inscrições abertas" || trainingClass.status === "Poucas vagas")
            ).length,
          },
          { key: "status", label: "Status", render: (row: Course) => renderStatusBadge(row.status) },
        ],
        onEdit: (row: Course) => {
          setEditingId(row.id);
          setForm({
            title: row.title,
            pathId: row.pathId,
            modalities: row.modalities?.length ? row.modalities : [row.modality],
            durationHours: resolveDurationHours(row),
            price: String(row.price),
            status: row.status,
            shortDescription: row.shortDescription,
            fullDescription: row.fullDescription,
            image: row.image,
            level: row.level,
            targetAudience: row.targetAudience || [],
            categories: row.categories?.length ? row.categories : row.category ? [row.category] : [],
            featured: row.featured ? "Sim" : "Não",
            objectives: row.objectives || [],
            benefits: row.benefits || [],
            modules: row.modules || [],
          });
          setValidationErrors([]);
          setOpen(true);
        },
        onDelete: (row: Course) => store.deleteCourse(row.id),
        onSave: async () => {
          const modalities = strArr(form.modalities);
          const categories = strArr(form.categories);
          const targetAudience = strArr(form.targetAudience);
          const objectives = strArr(form.objectives);
          const benefits = strArr(form.benefits);
          const modules = modulesArr(form.modules);

          const validation = validateCourse(
            {
              ...form,
              modality: modalities[0] ?? "",
              modalities: JSON.stringify(modalities),
              categories: JSON.stringify(categories),
              targetAudience: JSON.stringify(targetAudience),
              objectives: JSON.stringify(objectives),
              benefits: JSON.stringify(benefits),
            },
            modules
          );
          if (!validation.valid) { setValidationErrors(validation.errors); return; }
          try {
            await store.upsertCourse({
              id: editingId ?? undefined,
              title: str(form.title),
              pathId: str(form.pathId),
              modality: (modalities[0] ?? "Ao vivo online") as Course["modality"],
              modalities: modalities as Course["modality"][],
              durationHours: Number(form.durationHours || 0),
              price: Number(form.price || 0),
              status: str(form.status) as Course["status"],
              shortDescription: str(form.shortDescription),
              fullDescription: str(form.fullDescription),
              image: str(form.image),
              level: str(form.level) as Course["level"],
              targetAudience,
              category: categories[0],
              categories,
              featured: form.featured === "Sim",
              objectives,
              benefits,
              modules,
            });
            setOpen(false);
            setValidationErrors([]);
          } catch (error) {
            toast.error(`Erro ao salvar: ${error instanceof Error ? error.message : "Tente novamente"}`);
          }
        },
        fields: [
          {
            key: "title",
            label: "Nome do curso",
            type: "text",
            required: true,
            maxLength: ADMIN_VARCHAR_240_MAX_LENGTH,
            placeholder: "Ex.: Gestão de contratos administrativos",
          },
          {
            key: "pathId",
            label: "Trilha",
            type: "select",
            options: pathOptions,
            required: true,
            hint: "Define a trilha pública e a classificação do catálogo.",
          },
          {
            key: "modalities",
            label: "Modalidades",
            type: "multiselect",
            options: modalityOptions,
            required: true,
            hint: "Selecione todas as modalidades em que o curso pode ser ofertado.",
          },
          {
            key: "level",
            label: "Nível",
            type: "select",
            required: true,
            options: COURSE_LEVEL_OPTIONS,
            hint: "Use o nível que melhor representa a profundidade do conteúdo.",
          },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: statusOptions,
            required: true,
            hint: "Ativo, Destaque e Em breve publicam no catálogo; Rascunho e Arquivado ficam ocultos.",
          },
          {
            key: "featured",
            label: "Curso destaque",
            type: "select",
            options: [
              { value: "Não", label: "Não" },
              { value: "Sim", label: "Sim" },
            ],
            required: false,
            hint: "Deixe como Não no cadastro inicial, a menos que o curso vá entrar em destaque.",
          },
          {
            key: "durationHours",
            label: "Carga horária",
            type: "number",
            required: true,
            placeholder: "Ex.: 16",
          },
          {
            key: "price",
            label: "Preço (R$)",
            type: "number",
            required: true,
            placeholder: "1290",
            hint: "Informe o valor total em reais, sem símbolo de moeda.",
          },
          {
            key: "image",
            label: "URL da imagem",
            type: "text",
            required: false,
            placeholder: "/images/courses/gestao-contratos.jpg",
            hint: "Use uma URL pública ou um caminho do projeto para a capa do curso.",
          },
          {
            key: "targetAudience",
            label: "Público-alvo",
            type: "array",
            required: false,
            placeholder: "Ex.: Gestores públicos",
            hint: "Adicione um público por item, separando perfis relevantes do curso.",
          },
          {
            key: "categories",
            label: "Categorias",
            type: "array",
            suggestions: categoryOptions,
            required: false,
            placeholder: "Ex.: Licitações e Contratos",
            hint: "Use categorias que ajudem a encontrar o curso no catálogo.",
          },
          {
            key: "shortDescription",
            label: "Descrição curta",
            type: "textarea",
            required: true,
            placeholder: "Ex.: Curso prático para equipes que precisam revisar contratos com segurança.",
          },
          {
            key: "fullDescription",
            label: "Descrição completa",
            type: "textarea",
            required: true,
            placeholder: "Explique o problema atendido, o que será coberto e o resultado esperado.",
          },
          {
            key: "objectives",
            label: "Objetivos",
            type: "array",
            required: false,
            placeholder: "Ex.: Reduzir falhas em processos de contratação",
            hint: "Inclua objetivos observáveis e práticos.",
          },
          {
            key: "benefits",
            label: "Benefícios",
            type: "array",
            required: false,
            placeholder: "Ex.: Material de apoio",
            hint: "Liste os ganhos concretos que o participante terá.",
          },
          {
            key: "modules",
            label: "Módulos",
            type: "modules",
            required: false,
            hint: "Cada módulo precisa de título, descrição, duração e tópicos.",
          },
        ] as FieldConfig[],
      };
    }

    case "classes": {
      const rows = store.classes.filter((item) => {
        const courseName = store.courses.find((c) => c.id === item.courseId)?.title ?? "";
        const instructorName = store.instructors.find((instructor) => instructor.id === item.instructorId)?.name ?? "";
        const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
        return [courseName, item.id, item.modality, instructorName]
          .some((value) => lower(value).includes(normalizedSearch));
      });
      const courseOptions = store.courses.map((c) => ({ value: c.id, label: c.title }));
      const selectedCourse = store.courses.find((c) => c.id === form.courseId);
      const getCourseModalities = (course: Course) =>
        course.modalities?.length ? course.modalities : [course.modality];
      const modalityOptions = selectedCourse
        ? getCourseModalities(selectedCourse).map((value) => ({ value, label: value }))
        : courseOptions.length
          ? store.courses
              .flatMap((course) => getCourseModalities(course))
              .filter((value, index, list) => list.indexOf(value) === index)
              .map((value) => ({ value, label: value }))
          : [];
      const classStatusOptions = [
        { value: "Inscrições abertas", label: "Inscrições abertas" },
        { value: "Poucas vagas", label: "Poucas vagas" },
        { value: "Encerrada", label: "Encerrada" },
        { value: "Em breve", label: "Em breve" },
      ];
      const instructorOptions = store.instructors.map((i) => ({ value: i.id, label: i.name }));
      const activeClasses = store.classes.filter(
        (item) => item.status === "Inscrições abertas" || item.status === "Poucas vagas"
      ).length;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const startingWindowEnd = new Date(todayStart);
      startingWindowEnd.setDate(startingWindowEnd.getDate() + 30);
      const startingClasses = store.classes.filter((item) => {
        const startsAt = parseDate(item.startDate).getTime();
        return startsAt >= todayStart.getTime() && startsAt <= startingWindowEnd.getTime();
      }).length;
      const totalSeatsAll = store.classes.reduce((sum, item) => sum + item.totalSeats, 0);
      const filledSeatsAll = store.classes.reduce((sum, item) => sum + item.filledSeats, 0);
      const occupancyRate = toOccupancyPercent(filledSeatsAll, totalSeatsAll);

      return {
        title: "Turmas",
        description: `${activeClasses} ${activeClasses === 1 ? "turma aberta" : "turmas abertas"} · ${occupancyRate}% de ocupação média`,
        primaryActionLabel: "Nova turma",
        rows,
        stats: [
          {
            label: "Turmas ativas",
            value: String(activeClasses),
            helper: "Com inscrições abertas ou poucas vagas.",
            icon: CalendarCheck,
          },
          {
            label: "Cursos no catálogo",
            value: String(store.courses.length),
            helper: "Total de cursos cadastrados.",
            icon: BookOpen,
          },
          {
            label: "Iniciando em 30 dias",
            value: String(startingClasses),
            helper: "Turmas com início no próximo mês.",
            icon: Users,
          },
          {
            label: "Taxa de ocupação",
            value: `${occupancyRate}%`,
            helper: "Vagas preenchidas sobre o total ofertado.",
            icon: TrendingUp,
          },
        ],
        columns: [
          {
            key: "class", label: "Turma",
            render: (row: TrainingClass) => (
              <div>
                <div className="font-semibold text-tk-ink">
                  {store.courses.find((course) => course.id === row.courseId)?.title ?? "Curso não localizado"}
                </div>
                <div className="mt-0.5 text-xs text-tk-ink-muted">{row.id}</div>
              </div>
            ),
            exportValue: (row: TrainingClass) => {
              const course = store.courses.find((item) => item.id === row.courseId)?.title ?? "Curso não localizado";
              return `${course} · ${row.id}`;
            },
          },
          {
            key: "date", label: "Data",
            render: (row: TrainingClass) => formatDateOnlyPtBR(row.startDate),
          },
          {
            key: "modality", label: "Modalidade",
            render: (row: TrainingClass) => row.modality,
          },
          {
            key: "filledSeats", label: "Ocupação",
            render: (row: TrainingClass) => <SeatProgress filled={row.filledSeats} total={row.totalSeats} />,
            exportValue: (row: TrainingClass) => `${row.filledSeats}/${row.totalSeats} (${toOccupancyPercent(row.filledSeats, row.totalSeats)}%)`,
          },
          {
            key: "instructor", label: "Instrutor",
            render: (row: TrainingClass) =>
              store.instructors.find((instructor) => instructor.id === row.instructorId)?.name ?? "—",
          },
          { key: "status", label: "Status", render: (row: TrainingClass) => renderStatusBadge(row.status) },
        ],
        onEdit: (row: TrainingClass) => {
          const rowConfirmedEnrollments = store.enrollments.filter(
            (item) =>
              item.classId === row.id &&
              (item.status === "Confirmada" || item.status === "Aguardando pagamento" || item.status === "Concluída")
          ).length;
          setEditingId(row.id);
          setForm({
            courseId: row.courseId,
            startDate: row.startDate.slice(0, 10),
            endDate: row.endDate.slice(0, 10),
            time: row.time || "",
            modality: row.modality,
            status: row.status,
            location: row.location,
            instructorId: row.instructorId || "",
            totalSeats: String(row.totalSeats),
            manualFilledSeats: String(row.manualFilledSeats ?? Math.max(row.filledSeats - rowConfirmedEnrollments, 0)),
            price: row.price > 0 ? String(row.price) : "",
          });
          setValidationErrors([]);
          setOpen(true);
        },
        onDelete: (row: TrainingClass) => store.deleteClass(row.id),
        onSave: async () => {
          const validation = validateClass(form);
          if (!validation.valid) { setValidationErrors(validation.errors); return; }
          try {
            const totalSeats = Number(form.totalSeats || 0);
            const manualFilledSeats = Number(form.manualFilledSeats || 0);
            await store.upsertClass({
              id: editingId ?? undefined,
              courseId: str(form.courseId),
              startDate: normalizeDateForStorage(str(form.startDate)),
              endDate: normalizeDateForStorage(str(form.endDate)),
              time: str(form.time),
              modality: str(form.modality) as TrainingClass["modality"],
              status: str(form.status) as TrainingClass["status"],
              location: str(form.location),
              instructorId: optStr(form.instructorId),
              totalSeats,
              manualFilledSeats,
              price: numOrUndef(form.price) ?? 0,
            });
            setOpen(false);
            setValidationErrors([]);
          } catch (error) {
            toast.error(`Erro ao salvar: ${error instanceof Error ? error.message : "Tente novamente"}`);
          }
        },
        fields: [
          { key: "courseId", label: "Curso", type: "select", options: courseOptions, required: true },
          { key: "startDate", label: "Data de início", type: "date", required: true },
          { key: "endDate", label: "Data final", type: "date", required: true },
          { key: "time", label: "Horário(s)", type: "text", required: true },
          { key: "modality", label: "Modalidade", type: "select", options: modalityOptions, required: true },
          { key: "totalSeats", label: "Quantidade de vagas", type: "number", required: true },
          { key: "manualFilledSeats", label: "Vagas preenchidas manualmente", type: "number" },
          {
            key: "price",
            label: "Preço da turma (R$)",
            type: "number",
            hint: "Vazio = usa o preço do curso. Preencha só se esta turma tiver um valor diferente.",
          },
          { key: "status", label: "Status", type: "select", options: classStatusOptions, required: true },
          {
            key: "instructorId",
            label: "Instrutor",
            type: "select",
            options: instructorOptions,
            hint: "Selecione o instrutor antes de publicar: sem vínculo, a página pública não exibe um instrutor específico.",
          },
          { key: "location", label: "Local", type: "text" },
        ],
      };
    }

    case "students": {
      const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
      const rows = store.students.filter((item) =>
        [item.name, item.cpf, item.email].some((value) =>
          lower(value).includes(normalizedSearch)
        )
      );
      const activeStudents = store.students.filter(
        (item) => item.enrollmentStatus === "Confirmada" || item.enrollmentStatus === "Concluída"
      ).length;
      const inactiveStudents = store.students.length - activeStudents;
      const certifiedStudents = store.students.filter((item) => item.certificateIssued).length;

      return {
        title: "Alunos",
        description: "Localizar cadastros e compreender seus vínculos com matrículas.",
        primaryActionLabel: "Novo aluno",
        rows,
        stats: [
          {
            label: "Total de alunos",
            value: String(store.students.length),
            helper: "Cadastros com ao menos uma inscrição.",
            icon: Users,
          },
          {
            label: "Ativos",
            value: String(activeStudents),
            helper: "Inscrições confirmadas ou concluídas.",
            icon: UserCheck,
          },
          {
            label: "Inativos",
            value: String(inactiveStudents),
            helper: "Pendentes, aguardando pagamento ou cancelados.",
            icon: UserX,
          },
          {
            label: "Certificados emitidos",
            value: String(certifiedStudents),
            helper: "Alunos com certificado já liberado.",
            icon: UserCheck,
          },
        ],
        columns: [
          {
            key: "name",
            label: "Aluno",
            render: (row: Student) => <UserCell name={row.name} email={row.email} />,
            exportValue: (row: Student) => `${row.name} <${row.email}>`,
          },
          { key: "organization", label: "Organização", render: (row: Student) => row.organization || "Informação indisponível" },
          {
            key: "enrollments",
            label: "Matrículas",
            render: (row: Student) => String(store.enrollments.filter((enrollment) =>
              enrollment.email.toLocaleLowerCase("pt-BR") === row.email.toLocaleLowerCase("pt-BR") || enrollment.cpf === row.cpf
            ).length),
          },
          {
            key: "lastActivity",
            label: "Última atividade",
            render: (row: Student) => {
              const enrollmentDates = store.enrollments
                .filter((enrollment) =>
                  enrollment.email.toLocaleLowerCase("pt-BR") === row.email.toLocaleLowerCase("pt-BR") || enrollment.cpf === row.cpf
                )
                .map((enrollment) => enrollment.createdAt)
                .filter(Boolean)
                .sort((left, right) => new Date(right).getTime() - new Date(left).getTime());
              return formatAdminDate(enrollmentDates[0] ?? row.enrolledAt);
            },
          },
        ],
        onEdit: (row: Student) => {
          setEditingId(row.id);
          setForm({
            name: row.name,
            email: row.email,
            organization: row.organization,
          });
          setValidationErrors([]);
          setOpen(true);
        },
        onDelete: (row: Student) => store.deleteStudent(row.id),
        onSave: async () => {
          const validation = validateStudent(form);
          if (!validation.valid) { setValidationErrors(validation.errors); return; }
          try {
            if (editingId) {
              await store.updateStudent({
                id: editingId,
                name: str(form.name),
                email: str(form.email),
                organization: str(form.organization),
              });
            } else {
              await store.createStudent({
                name: str(form.name),
                email: str(form.email),
                organization: str(form.organization),
              });
            }
            setOpen(false);
            setValidationErrors([]);
          } catch (error) {
            toast.error(`Erro ao salvar: ${error instanceof Error ? error.message : "Tente novamente"}`);
          }
        },
        fields: [
          { key: "name", label: "Nome", type: "text", required: true },
          { key: "email", label: "E-mail", type: "text", required: true },
          { key: "organization", label: "Empresa / órgão", type: "text", required: true },
        ],
      };
    }

    case "leads": {
      const rows = store.leads.filter((item) =>
        lower(item.name).includes(lower(search))
      );
      const leadTypeOptions = [
        { value: "Curso", label: "Curso" },
        { value: "InCompany", label: "In Company" },
        { value: "Consultoria", label: "Consultoria" },
        { value: "Newsletter", label: "Newsletter" },
        { value: "Orçamento", label: "Orçamento" },
        { value: "Contato", label: "Contato" },
      ];
      const originOptions = [
        { value: "Site", label: "Site" },
        { value: "WhatsApp", label: "WhatsApp" },
        { value: "Blog", label: "Blog" },
        { value: "Indicação", label: "Indicação" },
        { value: "LinkedIn", label: "LinkedIn" },
        { value: "Consultoria", label: "Consultoria" },
        { value: "Especialista", label: "Especialista" },
        { value: "Orçamento In Company", label: "Orçamento In Company" },
        { value: "Contato", label: "Contato" },
        { value: "Newsletter", label: "Newsletter" },
      ];
      const leadStatusOptions = [
        { value: "Novo", label: "Novo" },
        { value: "Em atendimento", label: "Em atendimento" },
        { value: "Proposta enviada", label: "Proposta enviada" },
        { value: "Convertido", label: "Convertido" },
        { value: "Perdido", label: "Perdido" },
      ];

      const newLeads = store.leads.filter((item) => item.status === "Novo").length;
      const leadsLast30Days = store.leads.filter((item) => isWithinLastDays(item.createdAt, 30)).length;
      const inProgressLeads = store.leads.filter(
        (item) => item.status === "Em atendimento" || item.status === "Proposta enviada"
      ).length;
      const convertedLeads = store.leads.filter((item) => item.status === "Convertido").length;
      const leadConversionRate = store.leads.length > 0 ? Math.round((convertedLeads / store.leads.length) * 100) : 0;

      return {
        title: "Gestão de leads",
        description: "Funil com origem, interesse e estágio comercial.",
        primaryActionLabel: "Novo lead",
        rows,
        stats: [
          {
            label: "Leads nos últimos 30 dias",
            value: String(leadsLast30Days),
            helper: "Contatos recebidos no período.",
            icon: Users,
          },
          {
            label: "Aguardando contato",
            value: String(newLeads),
            helper: "Ainda sem primeiro atendimento.",
            icon: UserCheck,
          },
          {
            label: "Em atendimento",
            value: String(inProgressLeads),
            helper: "Em contato ou com proposta enviada.",
            icon: Clock,
          },
          {
            label: "Taxa de conversão",
            value: `${leadConversionRate}%`,
            helper: "Leads convertidos sobre o total.",
            icon: Target,
          },
        ],
        columns: [
          {
            key: "name",
            label: "Lead",
            render: (row: Lead) => <span className="font-semibold text-tk-ink">{row.name}</span>,
            exportValue: (row: Lead) => row.name,
          },
          {
            key: "contact",
            label: "Contato",
            render: (row: Lead) => <UserCell name={row.email} email={row.phone || "Telefone não informado"} />,
            exportValue: (row: Lead) => [row.email, row.phone].filter(Boolean).join(" • "),
          },
          { key: "origin", label: "Origem", render: (row: Lead) => <Badge variant="muted">{row.origin}</Badge> },
          { key: "courseInterest", label: "Interesse", render: (row: Lead) => row.courseInterest },
          {
            key: "createdAt",
            label: "Recebido",
            render: (row: Lead) => formatAdminDate(row.createdAt),
            exportValue: (row: Lead) => formatAdminDate(row.createdAt),
          },
          { key: "status", label: "Status", render: (row: Lead) => renderStatusBadge(row.status) },
        ],
        onEdit: (row: Lead) => {
          setEditingId(row.id);
          setForm({
            name: row.name,
            email: row.email,
            phone: row.phone || "",
            type: row.type,
            courseInterest: row.courseInterest,
            courseId: row.courseId || "",
            origin: row.origin,
            status: row.status,
            organization: row.organization || "",
            teamSize: row.teamSize?.toString() || "",
            preferredModality: row.preferredModality || "",
            trainingObjective: row.trainingObjective || "",
            trainingTheme: row.trainingTheme || "",
            mainChallenges: row.mainChallenges || "",
            message: row.message || "",
          });
          setValidationErrors([]);
          setOpen(true);
        },
        onDelete: (row: Lead) => store.deleteLead(row.id),
        onSave: async () => {
          const validation = validateLead(form);
          if (!validation.valid) { setValidationErrors(validation.errors); return; }
          try {
            if (editingId) {
              await store.updateLead({
                id: editingId,
                name: str(form.name),
                email: str(form.email),
                phone: optStr(form.phone),
                type: str(form.type) as Lead["type"],
                courseInterest: str(form.courseInterest),
                courseId: optStr(form.courseId),
                origin: str(form.origin) as Lead["origin"],
                status: str(form.status) as Lead["status"],
                organization: optStr(form.organization),
                teamSize: numOrUndef(form.teamSize),
                preferredModality: optStr(form.preferredModality),
                trainingObjective: optStr(form.trainingObjective),
                trainingTheme: optStr(form.trainingTheme),
                mainChallenges: optStr(form.mainChallenges),
              });
            } else {
              await store.createLead({
                name: str(form.name),
                email: str(form.email),
                phone: optStr(form.phone),
                type: str(form.type) as Lead["type"],
                courseInterest: str(form.courseInterest),
                courseId: optStr(form.courseId),
                origin: str(form.origin) as Lead["origin"],
                status: str(form.status) as Lead["status"],
                organization: optStr(form.organization),
                teamSize: numOrUndef(form.teamSize),
                preferredModality: optStr(form.preferredModality),
                trainingObjective: optStr(form.trainingObjective),
                trainingTheme: optStr(form.trainingTheme),
                mainChallenges: optStr(form.mainChallenges),
                message: optStr(form.message) || "Lead criado manualmente no admin.",
              });
              toast.success("Lead cadastrado.");
            }
            setOpen(false);
            setValidationErrors([]);
          } catch (error) {
            toast.error(`Erro ao salvar: ${error instanceof Error ? error.message : "Tente novamente"}`);
          }
        },
        fields: [
          { key: "name", label: "Nome", type: "text", required: true },
          { key: "email", label: "E-mail", type: "text", required: true },
          { key: "phone", label: "Telefone", type: "text" },
          { key: "type", label: "Jornada comercial", type: "select", options: leadTypeOptions, required: true },
          { key: "courseInterest", label: "Interesse principal", type: "text", required: true, maxLength: ADMIN_VARCHAR_240_MAX_LENGTH },
          { key: "origin", label: "Origem", type: "select", options: originOptions, required: true },
          { key: "status", label: "Status", type: "select", options: leadStatusOptions, required: true },
          { key: "organization", label: "Empresa/Órgão", type: "text" },
          { key: "teamSize", label: "Tamanho da equipe", type: "number" },
          { key: "preferredModality", label: "Modalidade preferida", type: "text" },
          { key: "trainingObjective", label: "Objetivo do treinamento", type: "textarea" },
          { key: "trainingTheme", label: "Tema do treinamento", type: "textarea", maxLength: ADMIN_VARCHAR_240_MAX_LENGTH },
          { key: "mainChallenges", label: "Desafios principais", type: "textarea" },
        ],
      };
    }

    case "enrollments": {
      const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
      const rows = store.enrollments.filter((item) => {
        const course = store.courses.find((candidate) => candidate.id === item.courseId)?.title ?? "";
        const trainingClass = store.classes.find((candidate) => candidate.id === item.classId);
        return [
          item.studentName,
          item.email,
          item.cpf,
          course,
          trainingClass?.modality ?? "",
          item.enrollmentType ?? "",
          item.status,
        ]
          .some((value) => lower(value).includes(normalizedSearch));
      });
      const isEligibleEnrollmentClass = (status: string) =>
        status === "Inscrições abertas" ||
        status === "Poucas vagas" ||
        status === "Aberta" ||
        status === "PoucasVagas";
      const eligibleClasses = store.classes.filter(
        (item) => isEligibleEnrollmentClass(String(item.status))
      );
      const courseIdsWithClasses = new Set(eligibleClasses.map((item) => item.courseId));
      const courseOptions = store.courses
        .filter((course) => courseIdsWithClasses.has(course.id))
        .map((course) => ({ value: course.id, label: course.title }));
      const selectedCourseReference = str(form.courseId);
      const selectedCourse = store.courses.find(
        (course) =>
          course.id === selectedCourseReference ||
          course.slug === selectedCourseReference ||
          course.title === selectedCourseReference
      );
      const classOptions = store.classes
        .filter(
          (item) =>
            Boolean(selectedCourse?.id) &&
            item.courseId === selectedCourse?.id &&
            isEligibleEnrollmentClass(String(item.status))
        )
        .map((item) => ({
          value: item.id,
          label: `${store.courses.find((course) => course.id === item.courseId)?.title ?? "Curso"} • ${formatDateOnlyPtBR(item.startDate)}`,
        }));
      const enrollmentTypeOptions = [
        { value: "Pessoa física", label: "Pessoa física" },
        { value: "Empresa", label: "Empresa" },
        { value: "Órgão público", label: "Órgão público" },
      ];
      const paymentMethodOptions = [
        { value: "Pix", label: "Pix" },
        { value: "Cartão", label: "Cartão" },
        { value: "Boleto", label: "Boleto" },
        { value: "Empenho", label: "Empenho" },
      ];
      const enrollmentStatusOptions = [
        { value: "Pendente", label: "Pendente" },
        { value: "Aguardando pagamento", label: "Aguardando pagamento" },
        { value: "Confirmada", label: "Confirmada" },
        { value: "Cancelada", label: "Cancelada" },
        { value: "Concluída", label: "Concluída" },
      ];

      const confirmedEnrollmentsTotal = store.enrollments.filter(
        (item) => item.status === "Confirmada" || item.status === "Concluída"
      ).length;
      const awaitingPaymentEnrollments = store.enrollments.filter(
        (item) => item.status === "Aguardando pagamento"
      ).length;
      const completedEnrollmentsTotal = store.enrollments.filter((item) => item.status === "Concluída").length;

      return {
        title: "Pré-inscrições e matrículas",
        description: "Acompanhe pré-inscrições e matrículas do primeiro contato à conclusão, com status, tipo, turma e pagamento em um só lugar.",
        primaryActionLabel: "Nova pré-inscrição",
        rows,
        stats: [
          {
            label: "Total de inscrições",
            value: String(store.enrollments.length),
            helper: "Inscrições registradas na plataforma.",
            icon: Users,
          },
          {
            label: "Confirmadas",
            value: String(confirmedEnrollmentsTotal),
            helper: "Confirmadas ou já concluídas.",
            icon: UserCheck,
          },
          {
            label: "Aguardando pagamento",
            value: String(awaitingPaymentEnrollments),
            helper: "Pendentes de confirmação financeira.",
            icon: Clock,
          },
          {
            label: "Concluídas",
            value: String(completedEnrollmentsTotal),
            helper: "Capacitações finalizadas.",
            icon: TrendingUp,
          },
        ],
        columns: [
          {
            key: "studentName",
            label: "Aluno",
            render: (row: Enrollment) => <UserCell name={row.studentName} email={row.email} />,
            exportValue: (row: Enrollment) => `${row.studentName} <${row.email}>`,
          },
          {
            key: "class",
            label: "Turma",
            render: (row: Enrollment) => {
              const trainingClass = store.classes.find((item) => item.id === row.classId);
              const course = store.courses.find((item) => item.id === row.courseId);
              if (!trainingClass) return "Informação indisponível";
              return `${course?.title ?? "Curso não localizado"} • ${formatDateOnlyPtBR(trainingClass.startDate)}`;
            },
          },
          { key: "createdAt", label: "Inscrição", render: (row: Enrollment) => formatAdminDate(row.createdAt) },
          {
            key: "paymentMethod",
            label: "Pagamento",
            render: (row: Enrollment) => row.paymentMethod
              ? <Badge variant="muted">{row.paymentMethod}</Badge>
              : "Informação indisponível",
          },
          {
            key: "value",
            label: "Valor",
            render: (row: Enrollment) => {
              const trainingClass = store.classes.find((item) => item.id === row.classId);
              const course = store.courses.find((item) => item.id === row.courseId);
              const value = trainingClass?.price || course?.price;
              return typeof value === "number" && value > 0
                ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
                : "Informação indisponível";
            },
          },
          {
            key: "enrollmentType",
            label: "Tipo de inscrição",
            render: (row: Enrollment) => {
              const enrollmentType = row.enrollmentType || "Informação indisponível";
              return (
                <Badge variant="muted" aria-label={`Tipo de inscrição: ${enrollmentType}`}>
                  {enrollmentType}
                </Badge>
              );
            },
            exportValue: (row: Enrollment) => row.enrollmentType || "Informação indisponível",
          },
          { key: "status", label: "Status", render: (row: Enrollment) => renderStatusBadge(row.status) },
        ],
        onEdit: (row: Enrollment) => {
          const selectedCourse = store.courses.find((course) => course.id === row.courseId);
          const selectedClass = store.classes.find((item) => item.id === row.classId);

          setEditingId(row.id);
          setForm({
            studentName: row.studentName,
            email: row.email,
            phone: row.phone,
            cpf: row.cpf,
            organization: row.organization,
            jobTitle: row.jobTitle,
            courseTitle: selectedCourse?.title ?? "Curso não localizado",
            classLabel: selectedClass
              ? `${formatAdminDate(selectedClass.startDate)} • ${selectedClass.modality}`
              : "Turma não localizada",
            createdAtLabel: formatAdminDate(row.createdAt),
            paymentMethod: row.paymentMethod,
            enrollmentType: row.enrollmentType,
            derivedStatus: deriveEnrollmentOperationalStatus(row, selectedClass),
            status: row.status,
            courseId: row.courseId,
            classId: row.classId,
            notes: row.notes,
          });
          setValidationErrors([]);
          setOpen(true);
        },
        onDelete: (row: Enrollment) => store.deleteEnrollment(row.id),
        onSave: async () => {
          try {
            if (editingId) {
              const validation = validateEnrollment(form);
              if (!validation.valid) { setValidationErrors(validation.errors); return; }
              await store.updateEnrollmentStatus(editingId, str(form.status) as Enrollment["status"]);
            } else {
              const validation = validateEnrollmentCreate(form);
              if (!validation.valid) { setValidationErrors(validation.errors); return; }
              await store.createEnrollmentAdmin({
                studentName: str(form.studentName),
                email: str(form.email),
                phone: str(form.phone),
                cpf: str(form.cpf),
                organization: str(form.organization),
                jobTitle: str(form.jobTitle),
                enrollmentType: str(form.enrollmentType) as Enrollment["enrollmentType"],
                paymentMethod: str(form.paymentMethod) as Enrollment["paymentMethod"],
                courseId: str(form.courseId),
                classId: str(form.classId),
                notes: str(form.notes),
              });
            }
            setOpen(false);
            setValidationErrors([]);
          } catch (error) {
            toast.error(`Erro ao salvar: ${error instanceof Error ? error.message : "Tente novamente"}`);
          }
        },
        fields: editingId
          ? [
              { key: "studentName", label: "Aluno", type: "readonly", section: "Contexto da inscrição" },
              { key: "email", label: "E-mail", type: "readonly", section: "Contexto da inscrição" },
              { key: "courseTitle", label: "Curso", type: "readonly", section: "Contexto da inscrição" },
              { key: "classLabel", label: "Turma", type: "readonly", section: "Contexto da inscrição" },
              { key: "createdAtLabel", label: "Data da inscrição", type: "readonly", section: "Contexto da inscrição" },
              { key: "paymentMethod", label: "Pagamento", type: "readonly", section: "Contexto da inscrição" },
              { key: "enrollmentType", label: "Tipo de inscrição", type: "readonly", section: "Contexto da inscrição" },
              { key: "derivedStatus", label: "Status derivado", type: "readonly", section: "Contexto da inscrição" },
              {
                key: "status",
                label: "Atualizar status",
                type: "select",
                options: enrollmentStatusOptions,
                required: true,
                section: "Ação operacional",
              },
            ]
          : [
              { key: "studentName", label: "Aluno", type: "text", required: true },
              { key: "email", label: "E-mail", type: "text", required: true },
              { key: "phone", label: "Telefone", type: "text", required: true },
              { key: "cpf", label: "CPF", type: "text", required: true },
              { key: "organization", label: "Empresa/Órgão", type: "text" },
              { key: "jobTitle", label: "Cargo", type: "text" },
              { key: "enrollmentType", label: "Tipo de inscrição", type: "select", options: enrollmentTypeOptions, required: true },
              { key: "paymentMethod", label: "Pagamento", type: "select", options: paymentMethodOptions, required: true },
              { key: "courseId", label: "Curso", type: "select", options: courseOptions, required: true },
              { key: "classId", label: "Turma", type: "select", options: classOptions, required: true },
              { key: "notes", label: "Observações", type: "textarea" },
            ],
      };
    }

    case "instructors": {
      const rows = store.instructors.filter((item) =>
        lower(item.name).includes(lower(search))
      );
      const courseOptions = store.courses.map((course) => ({ value: course.id, label: course.title }));
      const instructorStatusOptions = [
        { value: "Ativo", label: "Ativo" },
        { value: "Inativo", label: "Inativo" },
      ];

      const activeInstructors = store.instructors.filter((item) => item.status === "Ativo").length;
      const inactiveInstructors = store.instructors.length - activeInstructors;
      const linkedCourseIds = new Set(
        store.instructors.flatMap((item) => item.courseIds || [])
      );

      return {
        title: "Gestão de instrutores",
        description: "Criar, editar, vincular cursos e acompanhar especialidades.",
        primaryActionLabel: "Novo instrutor",
        rows,
        stats: [
          {
            label: "Total de instrutores",
            value: String(store.instructors.length),
            helper: "Especialistas cadastrados.",
            icon: Users,
          },
          {
            label: "Ativos",
            value: String(activeInstructors),
            helper: "Disponíveis para novas turmas.",
            icon: UserCheck,
          },
          {
            label: "Inativos",
            value: String(inactiveInstructors),
            helper: "Sem vínculo ativo no momento.",
            icon: UserX,
          },
          {
            label: "Cursos vinculados",
            value: String(linkedCourseIds.size),
            helper: "Cursos com instrutor designado.",
            icon: BookOpen,
          },
        ],
        columns: [
          {
            key: "name",
            label: "Instrutor",
            render: (row: Instructor) => <UserCell name={row.name} email={row.email} />,
            exportValue: (row: Instructor) => `${row.name} <${row.email}>`,
          },
          { key: "specialty", label: "Especialidade", render: (row: Instructor) => row.specialty },
          { key: "status", label: "Status", render: (row: Instructor) => renderStatusBadge(row.status) },
        ],
        onEdit: (row: Instructor) => {
          setEditingId(row.id);
          setForm({
            name: row.name,
            email: row.email,
            phone: row.phone || "",
            specialty: row.specialty,
            bio: row.bio || "",
            education: row.education || "",
            photoUrl: row.photoUrl || (row.avatar.startsWith("/") || row.avatar.startsWith("http") ? row.avatar : ""),
            status: row.status,
            courseIds: row.courseIds || [],
          });
          setValidationErrors([]);
          setOpen(true);
        },
        onDelete: (row: Instructor) => store.deleteInstructor(row.id),
        onSave: async () => {
          const validation = validateInstructor(form);
          if (!validation.valid) { setValidationErrors(validation.errors); return; }
          try {
            await store.upsertInstructor({
              id: editingId ?? undefined,
              name: str(form.name),
              email: str(form.email),
              phone: optStr(form.phone),
              specialty: optStr(form.specialty),
              bio: optStr(form.bio),
              education: optStr(form.education),
              photoUrl: optStr(form.photoUrl),
              status: str(form.status) as Instructor["status"],
              courseIds: strArr(form.courseIds),
            });
            setOpen(false);
            setValidationErrors([]);
          } catch (error) {
            toast.error(`Erro ao salvar: ${error instanceof Error ? error.message : "Tente novamente"}`);
          }
        },
        fields: [
          { key: "name", label: "Nome", type: "text", required: true },
          { key: "email", label: "E-mail", type: "text" },
          { key: "phone", label: "Telefone", type: "text" },
          { key: "specialty", label: "Especialidade", type: "text" },
          { key: "education", label: "Formação", type: "textarea" },
          { key: "photoUrl", label: "URL da foto do professor", type: "text", placeholder: "https://..." },
          { key: "bio", label: "Biografia", type: "textarea" },
          { key: "courseIds", label: "Cursos vinculados", type: "multiselect", options: courseOptions },
          { key: "status", label: "Status", type: "select", options: instructorStatusOptions, required: true },
        ],
      };
    }

    case "blog": {
      const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
      const rows = store.blogPosts.filter((item) =>
        [item.title, item.author, item.category]
          .some((value) => lower(value).includes(normalizedSearch))
      );
      const categoryOptions = [
        { value: "Licitações", label: "Licitações" },
        { value: "LGPD", label: "LGPD" },
        { value: "Compliance", label: "Compliance" },
        { value: "Departamento Pessoal", label: "Departamento Pessoal" },
        { value: "eSocial", label: "eSocial" },
        { value: "Folha de Pagamento", label: "Folha de Pagamento" },
        { value: "Gestão Pública", label: "Gestão Pública" },
        { value: "Liderança", label: "Liderança" },
        { value: "Tecnologia", label: "Tecnologia" },
        { value: "Assédio e Compliance", label: "Assédio e Compliance" },
      ];
      const blogStatusOptions = [
        { value: "Rascunho", label: "Rascunho" },
        { value: "Em revisão", label: "Em revisão" },
        { value: "Agendado", label: "Agendado" },
        { value: "Publicado", label: "Publicado" },
        { value: "Arquivado", label: "Arquivado" },
      ];
      const courseOptions = store.courses.map((c) => ({ value: c.id, label: c.title }));

      const publishedPosts = store.blogPosts.filter((item) => item.status === "Publicado").length;
      const draftPosts = store.blogPosts.filter((item) => item.status === "Rascunho").length;
      const activeCategories = new Set(
        store.blogPosts.filter((item) => item.status === "Publicado").map((item) => item.category)
      );

      return {
        title: "Blog",
        description: `${store.blogPosts.length} ${store.blogPosts.length === 1 ? "post" : "posts"} no acervo · ${publishedPosts} ${publishedPosts === 1 ? "publicado" : "publicados"} no site`,
        primaryActionLabel: "Novo post",
        rows,
        stats: [
          {
            label: "Total de posts",
            value: String(store.blogPosts.length),
            helper: "Conteúdos no acervo editorial.",
            icon: Newspaper,
          },
          {
            label: "Publicados",
            value: String(publishedPosts),
            helper: "Visíveis no blog público.",
            icon: FileText,
          },
          {
            label: "Rascunhos",
            value: String(draftPosts),
            helper: "Em produção, ainda não publicados.",
            icon: Clock,
          },
          {
            label: "Categorias ativas",
            value: String(activeCategories.size),
            helper: "Categorias com post publicado.",
            icon: Tag,
          },
        ],
        columns: [
          { key: "title", label: "Post", render: (row: BlogPost) => row.title },
          { key: "category", label: "Categoria", render: (row: BlogPost) => <Badge variant="muted">{row.category}</Badge> },
          { key: "author", label: "Autor", render: (row: BlogPost) => row.author },
          { key: "status", label: "Status", render: (row: BlogPost) => renderStatusBadge(row.status) },
          { key: "date", label: "Atualização", render: (row: BlogPost) => formatEditorialDate(row.date) },
        ],
        onEdit: (row: BlogPost) => {
          setEditingId(row.id);
          setForm({
            title: row.title,
            category: row.category,
            author: row.author,
            status: row.status,
            summary: row.summary,
            content: row.content,
            tags: row.tags || [],
            image: row.image || "",
            imageAlt: row.imageAlt || "",
            contentFormat: row.contentFormat || "plain",
            seoTitle: row.seoTitle || "",
            seoDescription: row.seoDescription || "",
            canonicalUrl: row.canonicalUrl || "",
            ogImageUrl: row.ogImageUrl || "",
            readingTime: row.readingTime || "",
            relatedCourseId: row.relatedCourseId || "",
          });
          setValidationErrors([]);
          setOpen(true);
        },
        onDelete: (row: BlogPost) => store.deleteBlogPost(row.id),
        onSave: async () => {
          const validation = validateBlogPost(form);
          if (!validation.valid) { setValidationErrors(validation.errors); return; }
          try {
            await store.upsertBlogPost({
              id: editingId ?? undefined,
              title: str(form.title),
              category: str(form.category) as BlogPost["category"],
              author: str(form.author),
              status: str(form.status) as BlogPost["status"],
              summary: str(form.summary),
              content: str(form.content),
              tags: strArr(form.tags),
              image: str(form.image),
              imageAlt: str(form.imageAlt),
              contentFormat: str(form.contentFormat) as "plain" | "markdown",
              seoTitle: optStr(form.seoTitle),
              seoDescription: optStr(form.seoDescription),
              canonicalUrl: optStr(form.canonicalUrl),
              ogImageUrl: optStr(form.ogImageUrl),
              readingTime: optStr(form.readingTime) || "5 min",
              relatedCourseId: optStr(form.relatedCourseId),
            });
            setOpen(false);
            setValidationErrors([]);
          } catch (error) {
            toast.error(`Erro ao salvar: ${error instanceof Error ? error.message : "Tente novamente"}`);
          }
        },
        fields: [
          { key: "title", label: "Título", type: "text", required: true, maxLength: ADMIN_VARCHAR_240_MAX_LENGTH },
          { key: "category", label: "Categoria", type: "select", options: categoryOptions, required: true },
          { key: "author", label: "Autor", type: "text", required: true },
          { key: "status", label: "Status", type: "select", options: blogStatusOptions, required: true },
          { key: "summary", label: "Resumo", type: "textarea", required: true },
          { key: "content", label: "Conteúdo", type: "textarea", required: true },
          { key: "image", label: "URL da imagem", type: "text" },
          { key: "imageAlt", label: "Texto alternativo da imagem", type: "text", section: "SEO e distribuição" },
          { key: "contentFormat", label: "Formato do conteúdo", type: "select", options: [{ value: "plain", label: "Texto simples" }, { value: "markdown", label: "Markdown seguro" }], section: "SEO e distribuição" },
          { key: "seoTitle", label: "Título SEO", type: "text", section: "SEO e distribuição" },
          { key: "seoDescription", label: "Descrição SEO", type: "textarea", section: "SEO e distribuição" },
          { key: "canonicalUrl", label: "URL canônica", type: "text", section: "SEO e distribuição" },
          { key: "ogImageUrl", label: "Imagem Open Graph", type: "text", section: "SEO e distribuição" },
          { key: "tags", label: "Tags", type: "array" },
          { key: "readingTime", label: "Tempo de leitura", type: "text" },
          { key: "relatedCourseId", label: "Curso relacionado", type: "select", options: courseOptions },
        ],
      };
    }

    default: {
      const exhaustive: never = resource;
      throw new Error(`Recurso de admin não suportado: ${String(exhaustive)}`);
    }
  }
}
