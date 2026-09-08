"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  MessageCircle,
  Play,
  ShieldCheck,
  Star,
  TriangleAlert,
  UserRound
} from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { getPublicCourseName } from "@/lib/seo";
import { useAppStore } from "@/lib/app-store";
import {
  getDisplayableEnrollmentClasses,
  isEnrollmentClassOpen,
  isTrainingClassSoldOut,
} from "@/lib/enrollment-class-resolution";
import { Link, useNavigate, useParams, useSearchParams } from "@/lib/router-compat";
import { cn, currency, parseDate } from "@/lib/utils";
import type { Course, Instructor, Testimonial, TrainingClass } from "@/types";

const MONTH_SHORT_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;

function formatDateShort(value: string) {
  const date = parseDate(value);
  const day = new Intl.DateTimeFormat("pt-BR", { day: "2-digit" }).format(date);

  return `${day} ${MONTH_SHORT_LABELS[date.getMonth()]} ${date.getFullYear()}`;
}

function formatMonthYearShort(value: string) {
  const date = parseDate(value);
  return `${MONTH_SHORT_LABELS[date.getMonth()]} ${date.getFullYear()}`;
}

function formatDateRange(trainingClass: TrainingClass) {
  const start = parseDate(trainingClass.startDate);
  const end = parseDate(trainingClass.endDate);
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameMonth && sameYear) {
    return `${new Intl.DateTimeFormat("pt-BR", { day: "2-digit" }).format(start)}–${new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit"
    }).format(end)} ${formatMonthYearShort(trainingClass.endDate)}`;
  }

  return `${formatDateShort(trainingClass.startDate)} – ${formatDateShort(trainingClass.endDate)}`;
}

function formatModalityLabel(value: Course["modality"], location?: string) {
  if (value === "Ao vivo online") {
    return "Online ao vivo";
  }

  if (value === "Presencial") {
    return location ? `Presencial · ${location}` : "Presencial";
  }

  if (value === "In company") {
    return "In company";
  }

  if (value === "Híbrido") {
    return "Híbrido";
  }

  return "Gravado";
}

function formatCourseModalities(course: Course) {
  const modalities = course.modalities?.length ? course.modalities : [course.modality];
  return modalities.join(" · ");
}

function getSpotMeta(trainingClass: TrainingClass) {
  if (isTrainingClassSoldOut(trainingClass)) {
    return {
      label: "Esgotada",
      className: "bg-[color:color-mix(in_srgb,var(--tk-error)_18%,white)] text-tk-error"
    };
  }

  if (trainingClass.status === "Poucas vagas") {
    return {
      label: "Últimas vagas",
      className: "bg-[color:color-mix(in_srgb,var(--tk-error)_18%,white)] text-tk-error"
    };
  }

  if (trainingClass.status === "Em breve") {
    return {
      label: "Turma nova",
      className: "bg-[color:color-mix(in_srgb,var(--tk-brand)_12%,white)] text-tk-brand"
    };
  }

  return {
    label: "Inscrições abertas",
    className: "bg-[color:color-mix(in_srgb,var(--tk-success)_14%,white)] text-tk-success"
  };
}

function getUrgencyLabel(trainingClass?: TrainingClass) {
  if (!trainingClass) {
    return "Sem turma aberta";
  }

  if (isTrainingClassSoldOut(trainingClass)) {
    return "Turma esgotada";
  }

  if (trainingClass.status === "Poucas vagas") {
    return `Últimas ${trainingClass.availableSeats} vagas na próxima turma`;
  }

  if (trainingClass.status === "Em breve") {
    return "Próxima turma em breve";
  }

  return "Turmas reduzidas";
}

function getInstructorPortrait(instructor?: Instructor) {
  const source = instructor?.photoUrl || instructor?.avatar || "";
  const isImage = source.startsWith("http") || source.startsWith("/");

  return { source, isImage };
}

type CourseDetailContent = {
  highlights?: Array<{ title: string; description: string }>;
  faqItems?: Array<{ question: string; answer: string }>;
  sidebar?: {
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
  corporateCta?: {
    badge?: string;
    title?: string;
    description?: string;
    primaryLabel?: string;
    primaryHref?: string;
    secondaryLabel?: string;
    secondaryHref?: string;
  };
  testimonialOverride?: {
    name?: string;
    role?: string;
    organization?: string;
    text?: string;
    rating?: number;
  } | null;
  heroSubtitle?: string | null;
};

// benefits e objectives são listas independentes (tamanhos podem divergir);
// nunca parear por índice entre elas — isso já produziu descrição trocada
// quando as listas tinham comprimentos diferentes.
function buildHighlightCards(course: Course, content?: CourseDetailContent) {
  if (content?.highlights?.length) {
    return content.highlights;
  }

  const titles = course.benefits.length ? course.benefits : course.objectives.length ? course.objectives : null;
  if (!titles) {
    return [{ title: course.shortDescription, description: course.shortDescription }];
  }

  return titles.map((title) => ({ title, description: course.shortDescription }));
}

function buildFaqItems(course: Course, selectedClass?: TrainingClass, content?: CourseDetailContent) {
  if (content?.faqItems?.length) {
    return content.faqItems;
  }

  return [
    {
      question: "Como faço minha inscrição?",
      answer: selectedClass
        ? `Clique em "Enviar pré-inscrição", selecione a turma e envie a solicitação. O pedido para o ${getPublicCourseName(course.title)} seguirá para análise sem perder o contexto da turma escolhida.`
        : `Este curso ainda não tem turma aberta. Clique em "Manifestar interesse" para falar com a equipe e receber a próxima agenda.`
    },
    {
      question: "Recebo certificado?",
      answer: `Sim. O curso tem carga de ${course.durationLabel} e a confirmação segue o fluxo padrão de inscrição e atendimento.`
    },
    {
      question: "Há turma presencial e online?",
      answer: selectedClass
        ? `A turma selecionada hoje está configurada como ${formatModalityLabel(selectedClass.modality, selectedClass.location)}.`
        : "As turmas abertas aparecem no card lateral com a modalidade e a data de cada opção."
    },
    {
      question: "Órgãos públicos podem contratar?",
      answer: "Sim. O fluxo do site preserva o atendimento consultivo para proposta, empenho e contratação corporativa."
    },
    {
      question: "Como escolho a melhor turma?",
      answer: "Use a seleção lateral para comparar data, modalidade, local e vagas antes de seguir para a inscrição."
    }
  ];
}

// Sem depoimento real (override editorial ou avaliação vinculada ao curso),
// a seção não é renderizada — nunca exibimos um depoimento fabricado (Story 17.2).
function buildTestimonial(course: Course, testimonials: Testimonial[], content?: CourseDetailContent) {
  if (content?.testimonialOverride?.text) {
    return {
      id: `testimonial-override-${course.id}`,
      name: content.testimonialOverride.name ?? "Aluno RH Cursos",
      role: content.testimonialOverride.role ?? "Participante",
      organization: content.testimonialOverride.organization ?? "Turma pública",
      course: course.title,
      text: content.testimonialOverride.text,
      rating: content.testimonialOverride.rating ?? 5
    } satisfies Testimonial;
  }

  return testimonials.find((item) => item.course === course.title) ?? null;
}

export function CourseDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { courses, classes, instructors, coursePublicContents, testimonials } = useAppStore();
  const [selectedClassId, setSelectedClassId] = useState("");

  const slugParam = Array.isArray(slug) ? slug[0] : slug;
  const querySlug = params.get("slug") ?? "";
  const course = courses.find((item) => item.slug === (slugParam || querySlug));
  const publicCourseName = course ? getPublicCourseName(course.title) : "";

  const courseClasses = useMemo(() => {
    if (!course) {
      return [];
    }

    return getDisplayableEnrollmentClasses(classes, course.id);
  }, [classes, course]);

  const instructor = instructors.find((item) => item.id === course?.instructorId);
  const courseContent = course ? coursePublicContents.find((item) => item.courseId === course.id && item.published) : undefined;
  const requestedClass = courseClasses.find((item) => item.id === selectedClassId);
  const firstOpenClass = courseClasses.find(isEnrollmentClassOpen);
  const selectedClass =
    (requestedClass && isEnrollmentClassOpen(requestedClass) ? requestedClass : undefined) ??
    firstOpenClass ??
    requestedClass ??
    courseClasses[0];
  const resolvedSelectedClassId = selectedClass?.id ?? "";
  const nextClass = firstOpenClass ?? courseClasses[0];
  const openClassesCount = courseClasses.filter(isEnrollmentClassOpen).length;
  const highlightCards = course ? buildHighlightCards(course, courseContent).slice(0, 6) : [];
  const faqItems = course ? buildFaqItems(course, selectedClass, courseContent) : [];
  const testimonial = course ? buildTestimonial(course, testimonials, courseContent) : null;

  useEffect(() => {
    if (!courseClasses.length) {
      setSelectedClassId("");
      return;
    }

    const preferredClassId =
      courseClasses.find((item) => item.id === course?.nextClassId && isEnrollmentClassOpen(item))?.id ??
      courseClasses.find(isEnrollmentClassOpen)?.id ??
      courseClasses.find((item) => item.id === course?.nextClassId)?.id ??
      courseClasses[0]?.id ??
      "";

    setSelectedClassId((current) => {
      const currentClass = courseClasses.find((item) => item.id === current);
      if (currentClass && (!firstOpenClass || isEnrollmentClassOpen(currentClass))) {
        return current;
      }

      return preferredClassId;
    });
  }, [course?.nextClassId, courseClasses, firstOpenClass]);

  const startCheckoutHref = selectedClass?.id
    ? `/cursos/${course?.slug}/checkout?classId=${selectedClass.id}`
    : `/cursos/${course?.slug}/checkout`;

  const startCheckout = () => {
    trackEvent("inscricao_cta", {
      course: course?.slug ?? "",
      origin: "hero_cta"
    });
    navigate(startCheckoutHref);
  };

  const handleProgramPdfRequest = () => {
    trackEvent("inscricao_cta", {
      course: course?.slug ?? "",
      origin: "program_pdf_request"
    });
    toast.message("Programa completo disponível sob solicitação pelo atendimento especializado.");
    window.location.assign("/falar-com-especialista");
  };

  useEffect(() => {
    if (params.get("checkout") !== "1" || !course) {
      return;
    }

    const nextParams = new URLSearchParams();
    if (selectedClass?.id) {
      nextParams.set("classId", selectedClass.id);
    }
    navigate(`/cursos/${course.slug}/checkout${nextParams.toString() ? `?${nextParams.toString()}` : ""}`, {
      replace: true,
    });
  }, [course, navigate, params, selectedClass?.id]);

  if (!course) {
    return (
      <section className="page-section">
        <div className="container">
          <EmptyState
            title="Curso não encontrado."
            description="Verifique o link ou volte para o catálogo completo."
            actionLabel="Voltar ao catálogo"
            onAction={() => window.history.back()}
          />
        </div>
      </section>
    );
  }

  const urgencyLabel = getUrgencyLabel(selectedClass);
  const portrait = getInstructorPortrait(instructor);
  const sidebarCopy = {
    investmentLabel: courseContent?.sidebar?.investmentLabel ?? "Valor de referência por participante",
    installmentText: courseContent?.sidebar?.installmentText ?? "Condições comerciais informadas após a análise da pré-inscrição.",
    nextClassesLabel: courseContent?.sidebar?.nextClassesLabel ?? "Próximas turmas",
    nextClassesEmptyLabel: courseContent?.sidebar?.nextClassesEmptyLabel ?? "Sem turmas abertas no momento.",
    guaranteeTitle: courseContent?.sidebar?.guaranteeTitle ?? "Solicitação sujeita a análise.",
    guaranteeText: courseContent?.sidebar?.guaranteeText ?? "A pré-inscrição não confirma vaga nem gera cobrança.",
    supportTitle: courseContent?.sidebar?.supportTitle ?? "Dúvidas sobre a inscrição?",
    supportText: courseContent?.sidebar?.supportText ?? "Fale com nossa equipe comercial para validar turma, proposta e formato ideal.",
    supportCtaLabel: courseContent?.sidebar?.supportCtaLabel ?? "Chamar no WhatsApp",
    programPdfLabel: courseContent?.sidebar?.programPdfLabel ?? "Programa PDF →",
    preEnrollmentLabel: courseContent?.sidebar?.preEnrollmentLabel ?? "Pré-inscrição pronta"
  };
  const corporateCta = {
    badge: courseContent?.corporateCta?.badge ?? "Para equipes",
    title: courseContent?.corporateCta?.title ?? "Quer este curso dentro da sua organização?",
    description:
      courseContent?.corporateCta?.description ??
      "Levamos este conteúdo para o seu time, adaptado ao seu contexto e ao seu calendário - presencial ou online.",
    primaryLabel: courseContent?.corporateCta?.primaryLabel ?? "Conhecer in-company",
    primaryHref: courseContent?.corporateCta?.primaryHref ?? "/in-company",
    secondaryLabel: courseContent?.corporateCta?.secondaryLabel ?? "Solicitar proposta",
    secondaryHref: courseContent?.corporateCta?.secondaryHref ?? "/in-company#quote-form"
  };
  const canStartEnrollment = Boolean(selectedClass && isEnrollmentClassOpen(selectedClass));
  const primaryCtaLabel = canStartEnrollment ? "Enviar pré-inscrição →" : "Manifestar interesse →";
  const primaryCtaHref = canStartEnrollment ? startCheckoutHref : "/falar-com-especialista";

  return (
    <>
      <div className="bg-[var(--tk-surface-2)] py-6 sm:py-8">
        <div className="mx-auto max-w-[1180px] overflow-hidden rounded-[20px] border border-[var(--tk-border)] bg-[var(--tk-surface)] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)]">
          <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_372px]">
            <div className="min-w-0">
              <header className="border-b border-[var(--tk-border)] bg-[var(--tk-gradient-soft)] px-4 py-10 sm:px-8 sm:py-11 lg:px-10 lg:py-14">
                <div className="max-w-[660px]">
                  <div className="mb-5 flex items-center gap-2 text-caption text-tk-ink-muted">
                    <Link to="/" className="hover:text-tk-ink">
                      Home
                    </Link>
                    <span aria-hidden="true">/</span>
                    <Link to="/cursos" className="hover:text-tk-ink">
                      Cursos
                    </Link>
                    <span aria-hidden="true">/</span>
                    <span className="text-tk-ink">{course.pathName}</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge tone="accent" dot>
                      {course.pathName}
                    </Badge>
                    {urgencyLabel ? (
                      <span className="inline-flex items-center gap-2 rounded-tk-pill bg-[color:color-mix(in_srgb,var(--tk-error)_10%,var(--tk-surface))] px-3 py-1 text-caption font-semibold text-tk-error">
                        <span className="h-1.5 w-1.5 rounded-tk-pill bg-current" aria-hidden="true" />
                        {urgencyLabel}
                      </span>
                    ) : null}
                  </div>

                  <h1 className="mt-5 max-w-[20ch] font-tk-display text-[2.3rem] font-bold leading-[1.08] tracking-[-0.02em] text-tk-ink sm:text-[2.7rem] lg:text-[3.3rem]">
                    {publicCourseName}
                  </h1>

                  <p className="mt-4 max-w-[58ch] font-tk-serif text-[1.05rem] font-normal leading-[1.45] text-tk-ink-muted sm:text-[1.15rem] lg:text-[1.2rem]">
                    {courseContent?.heroSubtitle ?? course.fullDescription}
                  </p>

                  <div className="mt-8 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-tk-pill border border-[var(--tk-border)] bg-tk-surface px-4 py-2 text-sm font-medium text-tk-ink">
                      <Clock3 aria-hidden="true" className="h-4 w-4 text-tk-accent" />
                      {course.durationLabel}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-tk-pill border border-[var(--tk-border)] bg-tk-surface px-4 py-2 text-sm font-medium text-tk-ink">
                      <CalendarDays aria-hidden="true" className="h-4 w-4 text-tk-accent" />
                      {selectedClass ? formatModalityLabel(selectedClass.modality, selectedClass.location) : formatCourseModalities(course)}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-tk-pill border border-[var(--tk-border)] bg-tk-surface px-4 py-2 text-sm font-medium text-tk-ink">
                      <ShieldCheck aria-hidden="true" className="h-4 w-4 text-tk-accent" />
                      Certificado de {course.durationHours}h
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-tk-pill border border-[var(--tk-border)] bg-tk-surface px-4 py-2 text-sm font-medium text-tk-ink">
                      <ShieldCheck aria-hidden="true" className="h-4 w-4 text-tk-accent" />
                      Nível {course.level}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-tk-pill border border-[var(--tk-border)] bg-tk-surface px-4 py-2 text-sm font-medium text-tk-ink">
                      <UserRound aria-hidden="true" className="h-4 w-4 text-tk-accent" />
                      Turmas reduzidas
                    </span>
                  </div>
                </div>
              </header>

              <main className="grid gap-14 px-4 py-12 sm:px-8 lg:px-10">
                <section aria-labelledby="beneficios">
                  <div className="mb-6">
                    <h2 id="beneficios" className="font-tk-display text-[2rem] font-bold tracking-[-0.02em] text-tk-ink">
                      O que você vai dominar
                    </h2>
                    <p className="mt-2 max-w-[46ch] font-tk-serif text-[1.05rem] font-normal leading-[1.45] text-tk-ink-muted">
                      Competências práticas para aplicar no dia seguinte ao curso.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {highlightCards.map((item) => (
                      <div key={item.title} className="flex gap-3 rounded-[14px] border border-[var(--tk-border)] bg-tk-surface p-4">
                        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--tk-accent-soft)] text-tk-brand">
                          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                        </span>
                        <div>
                          <div className="font-medium text-tk-ink">{item.title}</div>
                          <div className="mt-1 text-sm leading-6 text-tk-ink-muted">{item.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section
                  aria-labelledby="publico"
                  className="rounded-[16px] border border-[var(--tk-cream-dark)] bg-[var(--tk-cream)] p-8"
                >
                  <h2 id="publico" className="font-tk-display text-[1.7rem] font-bold tracking-[-0.01em] text-tk-ink">
                    Para quem é este curso
                  </h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {course.targetAudience.length ? (
                      course.targetAudience.map((audience) => (
                        <div key={audience} className="flex items-start gap-3 text-sm leading-6 text-tk-ink">
                          <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-tk-brand">
                            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                          </span>
                          <span>{audience}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-tk-ink-muted">Público-alvo não especificado.</p>
                    )}
                  </div>
                  {course.level === "Básico" ? (
                    <p className="mt-4 max-w-[68ch] text-sm leading-6 text-tk-ink-muted">
                      Não é necessário conhecimento prévio da temática do curso. Partimos do essencial e avançamos até os pontos
                      mais controversos.
                    </p>
                  ) : null}
                </section>

                <section aria-labelledby="programa">
                  <div className="mb-6">
                    <h2 id="programa" className="font-tk-display text-[2rem] font-bold tracking-[-0.02em] text-tk-ink">
                      Conteúdo programático
                    </h2>
                    <p className="mt-2 font-tk-serif text-[1.05rem] font-normal leading-[1.45] text-tk-ink-muted">
                      {course.modules.length} módulos · {course.durationLabel} · material de apoio e modelos incluídos
                    </p>
                  </div>

                  <Accordion type="multiple" className="grid gap-3">
                    {course.modules.map((module, index) => (
                      <AccordionItem
                        key={module.title}
                        value={`module-${index}`}
                        className="overflow-hidden rounded-[14px] border border-[var(--tk-border)] bg-tk-surface shadow-tk-card"
                      >
                        <AccordionTrigger className="px-5 py-4 text-left font-tk-display text-base font-bold tracking-[-0.01em] text-tk-ink hover:no-underline">
                          <span className="flex items-center gap-4">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--tk-accent-soft)] font-tk-display text-sm font-bold text-tk-brand">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span>
                              <span className="block text-base font-semibold text-tk-ink">{module.title}</span>
                              <span className="mt-1 block text-xs font-medium uppercase tracking-[0.12em] text-tk-ink-muted">
                                {module.duration}
                              </span>
                            </span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="px-5 pb-5 pt-0">
                          <div className="grid gap-2 pl-[3.25rem] text-sm leading-6 text-tk-ink-muted">
                            <p>{module.description}</p>
                            {module.topics.map((topic) => (
                              <div key={topic} className="flex items-start gap-2">
                                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-tk-accent" aria-hidden="true" />
                                <span>{topic}</span>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </section>

                <section
                  aria-labelledby="instrutor"
                  className="rounded-[16px] border border-[var(--tk-border)] bg-tk-surface p-8 shadow-[0_8px_30px_-20px_rgba(0,0,0,0.3)]"
                >
                  <div className="mb-5 text-xs font-semibold uppercase tracking-[0.06em] text-tk-ink-muted">Seu instrutor</div>
                  <div className="flex flex-col gap-6 md:flex-row md:items-start">
                    <div className="flex-none">
                      <div className="relative h-28 w-28 overflow-hidden rounded-full border border-[var(--tk-border)] bg-[var(--tk-surface-2)]">
                        {portrait.source ? (
                          portrait.isImage ? (
                            <Image src={portrait.source} alt={instructor?.name ?? publicCourseName} fill sizes="112px" className="object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center font-tk-display text-2xl font-bold text-tk-brand">
                              {portrait.source}
                            </div>
                          )
                        ) : (
                          <div className="flex h-full w-full items-center justify-center font-tk-display text-2xl font-bold text-tk-brand">
                            {instructor?.name
                              ? instructor.name
                                  .split(" ")
                                  .slice(0, 2)
                                  .map((part) => part[0])
                                  .join("")
                              : "RC"}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h2 id="instrutor" className="font-tk-display text-[1.7rem] font-bold tracking-[-0.01em] text-tk-ink">
                        {instructor?.name ?? "Instrutor"}
                      </h2>
                      <div className="mt-1 text-sm font-medium text-tk-accent-strong">
                        {instructor?.specialty ?? "Especialista do curso"}
                      </div>
                      <p className="mt-4 max-w-[70ch] text-sm leading-7 text-tk-ink-muted">
                        {instructor?.bio ??
                          "Mestre em sua área de atuação, com experiência prática em órgãos e empresas, conduzindo turmas com foco em aplicação imediata."}
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-2 rounded-tk-pill border border-[var(--tk-border)] bg-[var(--tk-surface-2)] px-3 py-1.5 text-caption font-semibold text-tk-ink">
                          <UserRound aria-hidden="true" className="h-4 w-4 text-tk-accent" />
                        {openClassesCount} turmas abertas
                        </span>
                        {course.studentsCount > 0 ? (
                          <span className="inline-flex items-center gap-2 rounded-tk-pill border border-[var(--tk-border)] bg-[var(--tk-surface-2)] px-3 py-1.5 text-caption font-semibold text-tk-ink">
                            <Star aria-hidden="true" className="h-4 w-4 text-tk-accent" />
                            {course.studentsCount.toLocaleString("pt-BR")} alunos
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </section>

                {testimonial ? (
                  <section
                    aria-labelledby="depoimento"
                    className="relative overflow-hidden rounded-[16px] border border-[var(--tk-cream-dark)] bg-[var(--tk-cream)] p-8"
                  >
                    <div className="absolute -right-2 -top-3 text-[5rem] font-tk-display font-bold text-tk-brand/10">“</div>
                    <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
                      <div className="flex-none">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-[0_8px_20px_-10px_rgba(0,0,0,0.25)]">
                          <div className="h-20 w-20 overflow-hidden rounded-full">
                            <Image
                              src={course.image}
                              alt={publicCourseName}
                              width={80}
                              height={80}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-3 flex gap-1" aria-label={`Avaliação ${testimonial.rating} de 5`}>
                          {Array.from({ length: testimonial.rating }).map((_, index) => (
                            <Star key={`star-${index}`} aria-hidden="true" className="h-4 w-4 fill-tk-accent text-tk-accent" />
                          ))}
                        </div>
                        <blockquote id="depoimento" className="font-tk-serif text-[1.05rem] font-normal leading-7 text-tk-ink">
                          &ldquo;{testimonial.text}&rdquo;
                        </blockquote>
                        <div className="mt-4 text-sm font-semibold text-tk-ink">{testimonial.name}</div>
                        <div className="text-caption text-tk-ink-muted">
                          {testimonial.role} · {testimonial.organization}
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}

                <section aria-labelledby="faq" className="text-center">
                  <h2 id="faq" className="font-tk-display text-[2rem] font-bold tracking-[-0.02em] text-tk-ink">
                    Perguntas frequentes
                  </h2>
                  <p className="mx-auto mt-2 max-w-[46ch] font-tk-serif text-[1.05rem] font-normal leading-[1.45] text-tk-ink-muted">
                    Tudo o que você precisa saber antes de se inscrever.
                  </p>
                  <div className="mx-auto mt-6 grid max-w-[640px] gap-3 text-left">
                    <Accordion type="single" collapsible className="grid gap-3">
                      {faqItems.map((item, index) => (
                        <AccordionItem
                          key={item.question}
                          value={`faq-${index}`}
                          className="overflow-hidden rounded-[12px] border border-[var(--tk-border)] bg-tk-surface shadow-tk-card"
                        >
                          <AccordionTrigger className="px-5 py-4 text-left font-medium text-tk-ink hover:no-underline">
                            {item.question}
                          </AccordionTrigger>
                          <AccordionContent className="px-5 pb-4 pt-0 text-sm leading-7 text-tk-ink-muted">
                            {item.answer}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                </section>
              </main>
            </div>

            <aside className="border-t border-[var(--tk-border)] bg-[var(--tk-surface)] xl:sticky xl:top-6 xl:border-l xl:border-t-0 xl:self-start">
              <div className="grid gap-4 p-4 sm:p-6">
                <div className="overflow-hidden rounded-[16px] border border-[var(--tk-border)] bg-tk-surface shadow-tk-card">
                  <div className="relative h-[180px] w-full">
                    <Image
                      src={course.image || "/images/hero-rh-cursos.jpg"}
                      alt={publicCourseName}
                      fill
                      sizes="(min-width: 1280px) 372px, 100vw"
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,106,131,0.12),rgba(12,106,131,0.4))]" />
                    <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-tk-brand shadow-[0_12px_30px_-12px_rgba(0,0,0,0.4)]">
                        <Play className="h-9 w-9 fill-current" />
                      </div>
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="text-caption text-tk-ink-muted">{sidebarCopy.investmentLabel}</div>
                    <div className="mt-1 flex items-baseline gap-3">
                      <span className="font-tk-display text-[2.1rem] font-bold tracking-[-0.01em] text-tk-brand">
                        {currency(selectedClass?.price ?? course.price)}
                      </span>
                    </div>
                    <div className="mt-1 text-caption text-tk-ink-muted">{sidebarCopy.installmentText}</div>

                    <div className="mt-6 text-caption font-semibold uppercase tracking-[0.06em] text-tk-ink-muted">
                      {sidebarCopy.nextClassesLabel}
                    </div>
                    <div className="mt-1 text-caption text-tk-ink-muted">
                      {openClassesCount} {openClassesCount === 1 ? "turma aberta" : "turmas abertas"} no calendário
                    </div>
                    <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Escolha a turma">
                      {courseClasses.length ? (
                        courseClasses.map((trainingClass) => {
                          const spotMeta = getSpotMeta(trainingClass);
                          const selectable = isEnrollmentClassOpen(trainingClass) || !firstOpenClass;
                          const selected = resolvedSelectedClassId === trainingClass.id;

                          return (
                            <button
                              key={trainingClass.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              disabled={!selectable}
                              onClick={() => {
                                if (selectable) setSelectedClassId(trainingClass.id);
                              }}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-[12px] border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                selected
                                  ? "border-tk-brand bg-[var(--tk-accent-soft)] shadow-[inset_0_0_0_1px_var(--tk-brand)]"
                                  : "border-[var(--tk-border)] bg-tk-surface hover:border-tk-accent"
                              )}
                            >
                              <span
                                className={cn(
                                  "inline-flex h-4 w-4 shrink-0 rounded-full border-2",
                                  selected ? "border-tk-brand bg-tk-brand" : "border-[var(--tk-border)] bg-white"
                                )}
                                aria-hidden="true"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-tk-ink">{formatDateRange(trainingClass)}</span>
                                <span className="mt-1 block text-caption text-tk-ink-muted">
                                  {formatModalityLabel(trainingClass.modality, trainingClass.location)} · {trainingClass.time}
                                </span>
                              </span>
                              <span className={cn("shrink-0 rounded-tk-pill px-3 py-1 text-[11px] font-semibold", spotMeta.className)}>
                                {spotMeta.label}
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <div className="rounded-[12px] border border-[var(--tk-border)] bg-tk-surface px-4 py-4 text-sm text-tk-ink-muted">
                          {sidebarCopy.nextClassesEmptyLabel}
                        </div>
                      )}
                    </div>

                    {nextClass ? (
                      <div className="mt-2 text-caption text-tk-ink-muted">
                        Próxima turma disponível: {formatDateRange(nextClass)}
                      </div>
                    ) : null}

                    {selectedClass ? (
                      <div className="mt-4 rounded-[12px] border border-[var(--tk-border)] bg-[var(--tk-surface-2)] px-4 py-3 text-sm text-tk-ink-muted">
                        <strong className="block text-tk-ink">{sidebarCopy.preEnrollmentLabel}</strong>
                        {formatDateRange(selectedClass)} · {formatModalityLabel(selectedClass.modality, selectedClass.location)}
                      </div>
                    ) : null}

                    {canStartEnrollment ? (
                      <Button
                        size="lg"
                        className="mt-5 w-full bg-tk-brand text-white hover:bg-tk-brand-hover hover:text-white"
                        onClick={startCheckout}
                        aria-label="Enviar pré-inscrição"
                      >
                        {primaryCtaLabel}
                      </Button>
                    ) : (
                      <Button asChild size="lg" className="mt-5 w-full bg-tk-brand text-white hover:bg-tk-brand-hover hover:text-white">
                        <Link to={primaryCtaHref} aria-label="Manifestar interesse">
                          {primaryCtaLabel}
                        </Link>
                      </Button>
                    )}

                    <div className="mt-3 flex justify-center">
                      <button
                        type="button"
                        onClick={handleProgramPdfRequest}
                        className="text-sm font-medium text-tk-accent transition hover:text-tk-brand-hover"
                      >
                        {sidebarCopy.programPdfLabel}
                      </button>
                    </div>

                    <div className="mt-5 border-t border-[var(--tk-line)] pt-5">
                      <div className="grid gap-3 text-sm leading-6 text-tk-ink">
                        <div className="flex items-start gap-3">
                          <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--tk-accent-soft)] text-tk-brand">
                            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                          </span>
                          <span>A pré-inscrição será analisada antes de qualquer confirmação de vaga.</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--tk-accent-soft)] text-tk-brand">
                            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                          </span>
                          <span>Atendimento comercial para proposta, grupo e compra corporativa.</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--tk-accent-soft)] text-tk-brand">
                            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                          </span>
                          <span>Escolha da turma preservada no envio da pré-inscrição.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[16px] border border-[var(--tk-border)] bg-tk-surface p-5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--tk-accent-soft)] text-tk-brand">
                      <TriangleAlert aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <div className="text-sm leading-6 text-tk-ink-muted">
                      <strong className="text-tk-ink">{sidebarCopy.guaranteeTitle}</strong> {sidebarCopy.guaranteeText}
                    </div>
                  </div>
                </div>

                <div className="rounded-[16px] border border-[var(--tk-border)] bg-[var(--tk-accent-soft)] p-5">
                  <div className="text-sm font-semibold text-tk-ink">{sidebarCopy.supportTitle}</div>
                  <div className="mt-1 text-sm leading-6 text-tk-ink-muted">{sidebarCopy.supportText}</div>
                  <Button asChild variant="outline" className="mt-4 w-full border-[var(--tk-border)] bg-white text-tk-ink">
                    <Link to="/falar-com-especialista">
                      <MessageCircle aria-hidden="true" className="h-4 w-4" />
                      {sidebarCopy.supportCtaLabel}
                    </Link>
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <section className="border-t border-[var(--tk-cream-dark)] bg-[var(--tk-cream)] py-14">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-10 px-4 sm:px-8 lg:px-10">
          <div className="max-w-[56ch]">
            <Badge tone="neutral" className="w-fit border-transparent bg-tk-brand px-4 py-2 text-sm text-tk-surface">
              {corporateCta.badge}
            </Badge>
            <h2 className="mt-4 max-w-[18ch] font-tk-display text-[2rem] font-bold leading-[1.15] tracking-[-0.02em] text-tk-ink">
              {corporateCta.title}
            </h2>
            <p className="mt-3 font-tk-serif text-[1.15rem] font-normal leading-[1.45] text-tk-ink-muted">
              {corporateCta.description}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to={corporateCta.primaryHref}>{corporateCta.primaryLabel}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to={corporateCta.secondaryHref}>{corporateCta.secondaryLabel}</Link>
            </Button>
          </div>
        </div>
      </section>

    </>
  );
}
