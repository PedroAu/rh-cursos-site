import { COURSE_LEVEL_OPTIONS, COURSE_MODALITY_OPTIONS, COURSE_STATUS_OPTIONS } from "@/lib/domain/course-enums";

const VALID_COURSE_STATUSES = new Set<string>(COURSE_STATUS_OPTIONS.map((option) => option.value));
const VALID_COURSE_MODALITIES = new Set<string>(COURSE_MODALITY_OPTIONS.map((option) => option.value));
const VALID_COURSE_LEVELS = new Set<string>(COURSE_LEVEL_OPTIONS.map((option) => option.value));
export const ADMIN_VARCHAR_240_MAX_LENGTH = 240;

export type ValidationError = {
  field: string;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

/** Form state values vêm de inputs genéricos (text/number/select/etc) e podem
 * chegar como string ou number — normaliza para string antes de validar. */
function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function strArr(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function addError(errors: ValidationError[], field: string, message: string) {
  errors.push({ field, message });
}

function addMaxLengthError(errors: ValidationError[], field: string, value: unknown, label: string) {
  if (str(value).length > ADMIN_VARCHAR_240_MAX_LENGTH) {
    addError(errors, field, `${label} não pode ter mais de ${ADMIN_VARCHAR_240_MAX_LENGTH} caracteres`);
  }
}

function hasSelectedValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => String(item).trim().length > 0);
  }

  return str(value).trim().length > 0;
}

export function validateCourse(
  form: Record<string, unknown>,
  modules?: Array<{ title: string; description: string; topics: string[]; duration: string }>
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!str(form.title).trim()) {
    addError(errors, "title", "Nome do curso é obrigatório");
  }
  addMaxLengthError(errors, "title", form.title, "Nome do curso");

  if (!str(form.pathId).trim()) {
    addError(errors, "pathId", "Selecione uma trilha");
  }

  if (!hasSelectedValue(form.modality) && !hasSelectedValue(form.modalities)) {
    addError(errors, "modalities", "Selecione pelo menos uma modalidade");
  } else {
    const selectedModalities = strArr(form.modalities).length > 0 ? strArr(form.modalities) : [str(form.modality)];
    if (selectedModalities.some((value) => value.trim() && !VALID_COURSE_MODALITIES.has(value))) {
      addError(errors, "modalities", "Modalidade selecionada é inválida");
    }
  }

  if (!str(form.durationHours).trim()) {
    addError(errors, "durationHours", "Carga horária é obrigatória");
  } else if (!Number.isFinite(Number(form.durationHours)) || Number(form.durationHours) <= 0) {
    addError(errors, "durationHours", "Carga horária deve ser um número válido maior que zero");
  }

  if (!str(form.price).trim()) {
    addError(errors, "price", "Preço é obrigatório");
  } else if (isNaN(Number(form.price)) || Number(form.price) < 0) {
    addError(errors, "price", "Preço deve ser um número válido (>= 0)");
  }

  if (!str(form.level).trim()) {
    addError(errors, "level", "Nível é obrigatório");
  } else if (!VALID_COURSE_LEVELS.has(str(form.level))) {
    addError(errors, "level", "Nível selecionado é inválido");
  }

  if (form.categories && form.categories !== "[]") {
    try {
      const categories = JSON.parse(str(form.categories));
      if (!Array.isArray(categories)) {
        addError(errors, "categories", "Categorias deve ser um array válido");
      }
    } catch {
      addError(errors, "categories", "Formato inválido nas categorias");
    }
  }

  if (form.targetAudience && form.targetAudience !== "[]") {
    try {
      const targetAudience = JSON.parse(str(form.targetAudience));
      if (!Array.isArray(targetAudience)) {
        addError(errors, "targetAudience", "Público-alvo deve ser um array válido");
      }
    } catch {
      addError(errors, "targetAudience", "Formato inválido no público-alvo");
    }
  }

  if (!str(form.status).trim()) {
    addError(errors, "status", "Status é obrigatório");
  } else if (!VALID_COURSE_STATUSES.has(str(form.status))) {
    addError(errors, "status", "Status selecionado é inválido");
  }

  if (!str(form.shortDescription).trim()) {
    addError(errors, "shortDescription", "Descrição curta é obrigatória");
  }

  if (!str(form.fullDescription).trim()) {
    addError(errors, "fullDescription", "Descrição completa é obrigatória");
  }

  if (form.objectives && form.objectives !== "[]") {
    try {
      const obj = JSON.parse(str(form.objectives));
      if (!Array.isArray(obj)) {
        addError(errors, "objectives", "Objetivos deve ser um array JSON válido");
      }
    } catch {
      addError(errors, "objectives", "Formato JSON inválido nos objetivos");
    }
  }

  if (form.benefits && form.benefits !== "[]") {
    try {
      const ben = JSON.parse(str(form.benefits));
      if (!Array.isArray(ben)) {
        addError(errors, "benefits", "Benefícios deve ser um array JSON válido");
      }
    } catch {
      addError(errors, "benefits", "Formato JSON inválido nos benefícios");
    }
  }

  if (modules && modules.length > 0) {
    modules.forEach((mod, i) => {
      if (!mod.title?.trim()) {
        addError(errors, "modules", `Módulo ${i + 1}: título é obrigatório`);
      }
      if (!mod.description?.trim()) {
        addError(errors, "modules", `Módulo ${i + 1}: descrição é obrigatória`);
      }
      if (!mod.duration?.trim()) {
        addError(errors, "modules", `Módulo ${i + 1}: duração é obrigatória`);
      }
      if (!mod.topics || mod.topics.length === 0 || !mod.topics.some(t => t?.trim())) {
        addError(errors, "modules", `Módulo ${i + 1}: adicione pelo menos um tópico`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateClass(form: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  if (!str(form.courseId).trim()) {
    addError(errors, "courseId", "Selecione um curso");
  }

  if (!str(form.startDate).trim()) {
    addError(errors, "startDate", "Data de início é obrigatória");
  } else if (!isValidDateInput(str(form.startDate))) {
    addError(errors, "startDate", "Data de início inválida");
  }

  if (!str(form.endDate).trim()) {
    addError(errors, "endDate", "Data final é obrigatória");
  } else if (!isValidDateInput(str(form.endDate))) {
    addError(errors, "endDate", "Data final inválida");
  }

  if (isValidDateInput(str(form.startDate)) && isValidDateInput(str(form.endDate))) {
    if (new Date(str(form.endDate)) < new Date(str(form.startDate))) {
      addError(errors, "endDate", "Data final deve ser igual ou posterior à data de início");
    }
  }

  if (!str(form.modality).trim()) {
    addError(errors, "modality", "Selecione uma modalidade");
  }

  if (!str(form.status).trim()) {
    addError(errors, "status", "Selecione um status");
  }

  if (!str(form.location).trim() && form.modality === "Presencial") {
    addError(errors, "location", "Local é obrigatório para turmas presenciais");
  }

  if (!str(form.time).trim()) {
    addError(errors, "time", "Horário é obrigatório");
  }

  if (!str(form.totalSeats).trim()) {
    addError(errors, "totalSeats", "Quantidade de vagas é obrigatória");
  } else if (isNaN(Number(form.totalSeats)) || Number(form.totalSeats) < 0) {
    addError(errors, "totalSeats", "Quantidade de vagas deve ser um número válido");
  }

  if (str(form.manualFilledSeats).trim()) {
    if (isNaN(Number(form.manualFilledSeats)) || Number(form.manualFilledSeats) < 0) {
      addError(errors, "manualFilledSeats", "Vagas manuais preenchidas deve ser um número válido");
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateStudent(form: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  if (!str(form.name).trim()) {
    addError(errors, "name", "Nome é obrigatório");
  }

  if (!str(form.email).trim()) {
    addError(errors, "email", "Email é obrigatório");
  } else if (!isValidEmail(str(form.email))) {
    addError(errors, "email", "Email inválido");
  }

  if (!str(form.organization).trim()) {
    addError(errors, "organization", "Empresa/órgão é obrigatório");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateLead(form: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  if (!str(form.name).trim()) {
    addError(errors, "name", "Nome é obrigatório");
  }

  if (!str(form.email).trim()) {
    addError(errors, "email", "Email é obrigatório");
  } else if (!isValidEmail(str(form.email))) {
    addError(errors, "email", "Email inválido");
  }

  if (!str(form.type).trim()) {
    addError(errors, "type", "Selecione o tipo de lead");
  }

  if (!str(form.courseInterest).trim()) {
    addError(errors, "courseInterest", "Informe o interesse principal");
  }
  addMaxLengthError(errors, "courseInterest", form.courseInterest, "Interesse principal");
  addMaxLengthError(errors, "trainingTheme", form.trainingTheme, "Tema do treinamento");

  if (!str(form.origin).trim()) {
    addError(errors, "origin", "Selecione uma origem");
  }

  if (!str(form.status).trim()) {
    addError(errors, "status", "Selecione um status");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateEnrollment(form: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  if (!str(form.status).trim()) {
    addError(errors, "status", "Status é obrigatório");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateEnrollmentCreate(form: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  if (!str(form.studentName).trim()) {
    addError(errors, "studentName", "Nome do aluno é obrigatório");
  }

  if (!str(form.email).trim()) {
    addError(errors, "email", "Email é obrigatório");
  } else if (!isValidEmail(str(form.email))) {
    addError(errors, "email", "Email inválido");
  }

  const phoneValue = str(form.phone).trim();
  const cpfValue = str(form.cpf).trim();

  if (!phoneValue) {
    addError(errors, "phone", "Telefone é obrigatório");
  } else if (!/^\(\d{2}\)\s\d{4,5}-\d{4}$/.test(phoneValue)) {
    addError(errors, "phone", "Telefone deve estar no formato (XX) XXXXX-XXXX ou (XX) XXXX-XXXX");
  }

  if (!cpfValue) {
    addError(errors, "cpf", "CPF é obrigatório");
  } else if (!/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(cpfValue)) {
    addError(errors, "cpf", "CPF deve estar no formato XXX.XXX.XXX-XX");
  }

  if (!str(form.courseId).trim()) {
    addError(errors, "courseId", "Selecione um curso");
  }

  if (!str(form.classId).trim()) {
    addError(errors, "classId", "Selecione uma turma");
  }

  if (!str(form.enrollmentType).trim()) {
    addError(errors, "enrollmentType", "Selecione o tipo de inscrição");
  }

  if (!str(form.paymentMethod).trim()) {
    addError(errors, "paymentMethod", "Selecione a forma de pagamento");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateInstructor(form: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  if (!str(form.name).trim()) {
    addError(errors, "name", "Nome é obrigatório");
  }

  if (str(form.email).trim() && !isValidEmail(str(form.email))) {
    addError(errors, "email", "Email inválido");
  }

  const photoUrl = str(form.photoUrl).trim();
  if (photoUrl && !/^https?:\/\//i.test(photoUrl)) {
    addError(errors, "photoUrl", "Informe uma URL HTTP(S); upload de arquivo não está disponível.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateBlogPost(form: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  if (!str(form.title).trim()) {
    addError(errors, "title", "Título é obrigatório");
  }
  addMaxLengthError(errors, "title", form.title, "Título");

  if (!str(form.category).trim()) {
    addError(errors, "category", "Selecione uma categoria");
  }

  if (!str(form.author).trim()) {
    addError(errors, "author", "Autor é obrigatório");
  }

  if (!str(form.status).trim()) {
    addError(errors, "status", "Status é obrigatório");
  }

  if (!str(form.summary).trim()) {
    addError(errors, "summary", "Resumo é obrigatório");
  } else if (str(form.summary).length < 20) {
    addError(errors, "summary", "Resumo deve ter pelo menos 20 caracteres");
  }

  if (!str(form.content).trim()) {
    addError(errors, "content", "Conteúdo é obrigatório");
  } else if (str(form.content).length < 100) {
    addError(errors, "content", "Conteúdo deve ter pelo menos 100 caracteres");
  } else if (/<\s*script\b|javascript:/i.test(str(form.content))) {
    addError(errors, "content", "Conteúdo contém um trecho não permitido");
  }

  addMaxLengthError(errors, "seoTitle", form.seoTitle, "Título SEO");
  if (str(form.seoDescription).length > 320) {
    addError(errors, "seoDescription", "Descrição SEO não pode ter mais de 320 caracteres");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function isValidDateInput(value?: string): boolean {
  if (!value?.trim()) return false;
  const normalized = new Date(`${value}T12:00:00`);
  return !isNaN(normalized.getTime());
}

export function getErrorMessage(errors: ValidationError[], field: string): string | undefined {
  return errors.find(e => e.field === field)?.message;
}

export function getErrorsForDisplay(errors: ValidationError[]): { [key: string]: string } {
  const result: { [key: string]: string } = {};
  errors.forEach(e => {
    if (!result[e.field]) {
      result[e.field] = e.message;
    }
  });
  return result;
}
