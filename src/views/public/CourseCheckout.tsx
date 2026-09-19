"use client";

import { cloneElement, isValidElement, useEffect, useId, useMemo, useState } from "react";
import { Check, CheckCircle2, ClipboardCheck, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/app-store";
import {
  getOpenEnrollmentClasses,
  resolveOpenEnrollmentClassId,
} from "@/lib/enrollment-class-resolution";
import { formatCPF, formatPhone } from "@/lib/format";
import { Link, useNavigate, useParams, useSearchParams } from "@/lib/router-compat";
import { fetchPublicClassesFromSupabase } from "@/lib/supabase/rh-cursos-api";
import { cn, parseDate } from "@/lib/utils";
import type { TrainingClass } from "@/types";

const PRE_ENROLLMENT_RECEIPT_STORAGE_KEY = "__latest_pre_enrollment_receipt__";

type ApplicantType = "person" | "company" | "public-organization";

const APPLICANT_OPTIONS: ReadonlyArray<{ value: ApplicantType; label: string }> = [
  { value: "person", label: "Pessoa física" },
  { value: "company", label: "Empresa" },
  { value: "public-organization", label: "Órgão público" },
];

type PreEnrollmentFormState = {
  applicantType: ApplicantType;
  classId: string;
  studentName: string;
  email: string;
  phone: string;
  cpf: string;
  organization: string;
  contactName: string;
  acceptedTerms: boolean;
};

const initialForm: PreEnrollmentFormState = {
  applicantType: "person",
  classId: "",
  studentName: "",
  email: "",
  phone: "",
  cpf: "",
  organization: "",
  contactName: "",
  acceptedTerms: false,
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatClassLabel(trainingClass: TrainingClass) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parseDate(trainingClass.startDate));
}

function Stepper() {
  const steps = ["Dados", "Recebimento"];

  return (
    <div className="mx-auto flex max-w-[360px] items-start justify-center">
      {steps.map((label, index) => {
        const active = index === 0;
        return (
          <div key={label} className="flex flex-1 items-start">
            <div className="flex w-full flex-col items-center gap-2">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold",
                  active
                    ? "border-tk-brand bg-tk-brand text-white ring-4 ring-tk-accent-soft"
                    : "border-tk-line bg-white text-tk-ink-muted",
                )}
                aria-current={active ? "step" : undefined}
              >
                {active ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}
              </div>
              <span className={cn("text-caption font-semibold", active ? "text-tk-ink" : "text-tk-ink-muted")}>
                {label}
              </span>
            </div>
            {index === 0 ? <div className="mt-[19px] h-0.5 flex-1 bg-tk-line" /> : null}
          </div>
        );
      })}
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-display text-[1.625rem] font-bold tracking-[-0.01em] text-tk-ink">
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm text-tk-ink-muted">{description}</p> : null}
    </div>
  );
}

function Field({
  label,
  error,
  required = false,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const generatedId = useId();
  const fieldId = `checkout-field-${generatedId}`;
  const errorId = error ? `${fieldId}-error` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: fieldId,
        "aria-describedby": errorId,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div className="grid gap-2 text-sm font-medium text-tk-ink">
      <label htmlFor={fieldId}>
        {label}
        {required ? <span className="ml-1 text-tk-error">*</span> : null}
      </label>
      {control}
      {error ? (
        <span id={errorId} className="text-caption text-tk-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function CourseCheckoutPage() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const { courses, classes, createEnrollment } = useAppStore();

  const [form, setForm] = useState<PreEnrollmentFormState>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [catalogClasses, setCatalogClasses] = useState<TrainingClass[] | null>(null);

  const courseSlug = Array.isArray(slug) ? slug[0] : slug;
  const course = courses.find((item) => item.slug === courseSlug);
  const paramsString = params.toString();
  const queryClassId = params.get("classId") ?? "";
  const availableClasses = catalogClasses ?? classes;

  useEffect(() => {
    let active = true;
    void fetchPublicClassesFromSupabase()
      .then((freshClasses) => {
        if (active && freshClasses) setCatalogClasses(freshClasses);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const courseClasses = useMemo(() => {
    if (!course) return [];
    return getOpenEnrollmentClasses(availableClasses, course.id);
  }, [availableClasses, course]);

  useEffect(() => {
    if (!courseClasses.length) return;

    const defaultClassId = resolveOpenEnrollmentClassId({
      classes: courseClasses,
      requestedClassId: queryClassId,
      preferredClassId: course?.nextClassId,
    });

    setForm((current) =>
      current.classId === defaultClassId ? current : { ...current, classId: defaultClassId },
    );

    if (defaultClassId !== queryClassId) {
      const nextParams = new URLSearchParams(paramsString);
      nextParams.set("classId", defaultClassId);
      setParams(nextParams);
    }
  }, [course?.nextClassId, courseClasses, paramsString, queryClassId, setParams]);

  const effectiveClassId = resolveOpenEnrollmentClassId({
    classes: courseClasses,
    requestedClassId: form.classId,
    preferredClassId: course?.nextClassId,
  });
  const selectedClass = courseClasses.find((item) => item.id === effectiveClassId) ?? null;

  const updateField = <K extends keyof PreEnrollmentFormState>(
    key: K,
    value: PreEnrollmentFormState[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
    if (submitError) setSubmitError(null);
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!effectiveClassId) nextErrors.classId = "Selecione uma turma para continuar.";

    if (form.applicantType === "person") {
      if (form.studentName.trim().length < 3) {
        nextErrors.studentName = "Nome deve ter no mínimo 3 caracteres.";
      }
    } else {
      if (!form.organization.trim()) nextErrors.organization = "Informe a organização.";
      if (form.contactName.trim().length < 3) {
        nextErrors.contactName = "Informe o nome do responsável.";
      }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      nextErrors.email = "Informe um e-mail válido.";
    }
    if (form.phone.replace(/\D/g, "").length < 10) {
      nextErrors.phone = "Telefone deve ter no mínimo 10 dígitos.";
    }
    if (form.cpf.replace(/\D/g, "").length !== 11) {
      nextErrors.cpf = "CPF deve ter 11 dígitos.";
    }
    if (!form.acceptedTerms) {
      nextErrors.acceptedTerms = "Autorize o uso dos dados e o contato sobre esta solicitação.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const enrollmentType =
    form.applicantType === "company"
      ? "Empresa"
      : form.applicantType === "public-organization"
        ? "Órgão público"
        : "Pessoa física";
  const applicantName =
    form.applicantType === "person" ? form.studentName.trim() : form.contactName.trim();

  const submit = async () => {
    if (!validate() || !course || !effectiveClassId) return;

    setIsSaving(true);
    setSubmitError(null);
    try {
      const liveClasses = await fetchPublicClassesFromSupabase().catch(() => null);
      const liveCourseClasses = liveClasses
        ? getOpenEnrollmentClasses(liveClasses, course.id)
        : courseClasses;
      const enrollmentClassId = resolveOpenEnrollmentClassId({
        classes: liveCourseClasses,
        requestedClassId: effectiveClassId,
        preferredClassId: course.nextClassId,
      });

      if (!enrollmentClassId) {
        throw new Error("Nenhuma turma aberta para este curso.");
      }

      const receipt = await createEnrollment({
        studentName: applicantName,
        email: form.email,
        phone: form.phone,
        cpf: form.cpf,
        organization: form.applicantType === "person" ? "" : form.organization.trim(),
        jobTitle: "",
        enrollmentType,
        courseId: course.id,
        classId: enrollmentClassId,
        notes: "Pré-inscrição enviada pela rota pública.",
      });
      const receiptState = {
        enrollmentId: receipt.enrollmentId,
        courseId: course.id,
        classId: receipt.classId,
      };

      try {
        window.sessionStorage.setItem(
          PRE_ENROLLMENT_RECEIPT_STORAGE_KEY,
          JSON.stringify(receiptState),
        );
      } catch {
        // Navigation state still transports the canonical receipt.
      }
      navigate("/inscricao-confirmada", { state: receiptState });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível enviar a pré-inscrição.";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!course) {
    return (
      <section className="page-section">
        <div className="container">
          <EmptyState
            title="Curso não encontrado."
            description="Verifique o link ou volte para o catálogo."
            actionLabel="Voltar ao catálogo"
            onAction={() => navigate("/cursos")}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="bg-[var(--tk-surface-2)] py-8 sm:py-10">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-8 lg:px-10">
        <div className="overflow-hidden rounded-tk-panel border border-tk-line bg-white shadow-tk-panel">
          <header className="border-b border-tk-line bg-[var(--tk-gradient-soft)] px-6 py-8 md:px-10">
            <div className="mx-auto max-w-[1100px]">
              <div className="mb-5 flex flex-wrap items-center gap-2 text-caption text-tk-ink-muted">
                <Link to="/">Home</Link>
                <span>/</span>
                <Link to="/cursos">Cursos</Link>
                <span>/</span>
                <Link to={`/cursos/${course.slug}`}>{course.title}</Link>
                <span>/</span>
                <span className="text-tk-ink">Pré-inscrição</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-[2rem] font-bold tracking-[-0.02em] text-tk-ink">
                    Enviar pré-inscrição
                  </h1>
                  <p className="mt-2 text-sm text-tk-ink-muted">
                    Sua solicitação será analisada pela equipe antes de qualquer confirmação de vaga.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-tk-ink-muted">
                  <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                  Seus dados são usados somente para esta solicitação.
                </div>
              </div>
              <div className="mt-6">
                <Stepper />
              </div>
            </div>
          </header>

          <div className="mx-auto grid max-w-[1100px] gap-11 px-6 py-11 md:grid-cols-[minmax(0,1fr)_372px] md:px-10">
            <main className="grid gap-6">
              <section className="rounded-tk-card border border-tk-line bg-white p-6 shadow-tk-glass md:p-8">
                <SectionTitle title="Escolha a turma" description={course.title} />
                <div aria-label="Escolha a turma" className="grid gap-2" role="radiogroup">
                  {courseClasses.map((trainingClass) => {
                    const checked = form.classId === trainingClass.id;
                    const startDate = formatClassLabel(trainingClass);
                    return (
                      <button
                        key={trainingClass.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-label={`Selecionar turma de ${startDate} às ${trainingClass.time}`}
                        onClick={() => {
                          updateField("classId", trainingClass.id);
                          const nextParams = new URLSearchParams(params.toString());
                          nextParams.set("classId", trainingClass.id);
                          setParams(nextParams);
                        }}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition",
                          checked
                            ? "border-tk-brand bg-tk-accent-soft ring-1 ring-inset ring-tk-brand"
                            : "border-tk-line bg-white hover:border-tk-accent",
                        )}
                      >
                        <span
                          className={cn(
                            "h-4 w-4 shrink-0 rounded-full border-2 shadow-tk-radio-indicator",
                            checked ? "border-tk-brand bg-tk-brand" : "border-tk-line bg-white",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-tk-ink">{startDate}</span>
                          <span className="mt-0.5 block text-caption text-tk-ink-muted">
                            {trainingClass.modality} · {trainingClass.time}
                          </span>
                        </span>
                        <span className="rounded-full bg-tk-accent-soft px-2.5 py-1 text-[11px] font-semibold text-tk-success">
                          Solicitações abertas
                        </span>
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.classId ? (
                  <p className="mt-3 text-caption text-tk-error" role="alert">
                    {fieldErrors.classId}
                  </p>
                ) : null}
              </section>

              <section className="rounded-tk-card border border-tk-line bg-white p-6 shadow-tk-glass md:p-8">
                <SectionTitle
                  title="Dados para contato"
                  description="Não solicitamos dados financeiros nesta etapa."
                />

                <div className="mb-5 grid gap-1 rounded-tk-icon border border-tk-line bg-[var(--tk-surface-2)] p-1 sm:grid-cols-3">
                  {APPLICANT_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={form.applicantType === value}
                      onClick={() => updateField("applicantType", value)}
                      className={cn(
                        "rounded-tk-segment px-3 py-2.5 text-sm font-semibold transition",
                        form.applicantType === value
                          ? "bg-white text-tk-brand shadow-sm"
                          : "text-tk-ink-muted",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {form.applicantType === "person" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <Field label="Nome completo" required error={fieldErrors.studentName}>
                        <Input
                          value={form.studentName}
                          onChange={(event) => updateField("studentName", event.target.value)}
                          placeholder="Seu nome completo"
                        />
                      </Field>
                    </div>
                    <Field label="CPF" required error={fieldErrors.cpf}>
                      <Input
                        value={form.cpf}
                        onChange={(event) => updateField("cpf", formatCPF(event.target.value))}
                        placeholder="000.000.000-00"
                      />
                    </Field>
                    <Field label="Telefone" required error={fieldErrors.phone}>
                      <Input
                        type="tel"
                        value={form.phone}
                        onChange={(event) => updateField("phone", formatPhone(event.target.value))}
                        placeholder="(00) 00000-0000"
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <Field label="E-mail" required error={fieldErrors.email}>
                        <Input
                          type="email"
                          value={form.email}
                          onChange={(event) => updateField("email", event.target.value)}
                          placeholder="voce@exemplo.com.br"
                        />
                      </Field>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <Field label="Organização" required error={fieldErrors.organization}>
                        <Input
                          value={form.organization}
                          onChange={(event) => updateField("organization", event.target.value)}
                          placeholder="Nome da organização"
                        />
                      </Field>
                    </div>
                    <Field label="Nome do responsável" required error={fieldErrors.contactName}>
                      <Input
                        value={form.contactName}
                        onChange={(event) => updateField("contactName", event.target.value)}
                        placeholder="Pessoa responsável"
                      />
                    </Field>
                    <Field label="CPF do responsável" required error={fieldErrors.cpf}>
                      <Input
                        value={form.cpf}
                        onChange={(event) => updateField("cpf", formatCPF(event.target.value))}
                        placeholder="000.000.000-00"
                      />
                    </Field>
                    <Field label="Telefone" required error={fieldErrors.phone}>
                      <Input
                        type="tel"
                        value={form.phone}
                        onChange={(event) => updateField("phone", formatPhone(event.target.value))}
                        placeholder="(00) 00000-0000"
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <Field label="E-mail" required error={fieldErrors.email}>
                        <Input
                          type="email"
                          value={form.email}
                          onChange={(event) => updateField("email", event.target.value)}
                          placeholder="contato@organizacao.gov.br"
                        />
                      </Field>
                    </div>
                  </div>
                )}

                <div className="mt-6 border-t border-tk-line pt-4">
                  <label className="flex items-start gap-3 text-sm text-tk-ink">
                    <Checkbox
                      checked={form.acceptedTerms}
                      onCheckedChange={(checked) => updateField("acceptedTerms", checked)}
                      aria-label="Autorizo o uso dos dados e o contato sobre esta pré-inscrição"
                    />
                    <span>Autorizo o uso dos dados enviados e o contato sobre esta pré-inscrição.</span>
                  </label>
                  {fieldErrors.acceptedTerms ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-tk-error" role="alert">
                      {fieldErrors.acceptedTerms}
                    </div>
                  ) : null}
                </div>

                {submitError ? (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-tk-error" role="alert">
                    {submitError}
                  </div>
                ) : null}

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <Button asChild size="lg" variant="secondary">
                    <Link to={`/cursos/${course.slug}`}>← Voltar ao curso</Link>
                  </Button>
                  <Button size="lg" loading={isSaving} onClick={submit}>
                    Enviar pré-inscrição →
                  </Button>
                </div>
              </section>
            </main>

            <aside className="grid gap-4 md:sticky md:top-6 md:self-start">
              <div className="overflow-hidden rounded-tk-card border border-tk-line bg-white shadow-card">
                <div className="p-6">
                  <SectionTitle title="Resumo da pré-inscrição" />
                  <h3 className="font-display text-lg font-bold tracking-[-0.01em] text-tk-ink">
                    {course.title}
                  </h3>
                  <p className="mt-1 text-sm text-tk-ink-muted">
                    {selectedClass
                      ? `${formatClassLabel(selectedClass)} · ${selectedClass.modality} · ${selectedClass.time}`
                      : "Selecione uma turma para ver o resumo."}
                  </p>
                  <div className="mt-5 border-t border-tk-line pt-4">
                    <p className="text-caption font-semibold uppercase tracking-[0.06em] text-tk-ink-muted">
                      valor de referência
                    </p>
                    <p className="mt-1 font-display text-2xl font-bold text-tk-brand">
                      {formatCurrency(selectedClass?.price ?? course.price)}
                    </p>
                    <p className="mt-2 text-caption leading-5 text-tk-ink-muted">
                      Condições comerciais e disponibilidade serão confirmadas pela equipe após a análise.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 rounded-2xl border border-tk-accent bg-tk-accent-soft px-5 py-4 text-sm leading-6 text-tk-ink-muted">
                <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-tk-brand" aria-hidden="true" />
                <p>
                  <strong className="text-tk-ink">Esta é uma solicitação.</strong> O envio não confirma vaga nem gera cobrança.
                </p>
              </div>
              <div className="flex gap-3 rounded-2xl border border-tk-line bg-white px-5 py-4 text-sm leading-6 text-tk-ink-muted">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-tk-brand" aria-hidden="true" />
                <p>Após o envio, você receberá uma referência para acompanhamento.</p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
