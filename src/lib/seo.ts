import type { Course, CoursePublicContent, TrainingClass } from "@/types";

export const SITE_URL = "https://www.rhcursos.com.br";

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "RH Cursos & Soluções",
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/images/brand/rh-cursos-logo-azul.png`,
  foundingDate: "2007",
  email: "info@rhcursos.com.br",
  address: {
    "@type": "PostalAddress",
    streetAddress: "QS 03 Lote 3, Ed. Pátio Capital, Sala 1105",
    addressLocality: "Águas Claras",
    addressRegion: "DF",
    postalCode: "71953-000",
    addressCountry: "BR"
  },
  telephone: "+55 61 3965-1929",
  sameAs: [
    "https://www.google.com/maps/search/RH+Cursos+%C3%81guas+Claras+Bras%C3%ADlia",
    "https://www.linkedin.com/company/rhcursoesolucoes",
    "https://www.facebook.com/rhcursostreinamento/",
    "https://www.instagram.com/rhcursos/",
    "https://www.youtube.com/@rhcursosetreinamentosempre580"
  ]
};

/**
 * Nome público/SEO dos cursos. Os slugs e os títulos persistidos continuam
 * sendo a fonte de verdade do catálogo; a expansão acontece apenas na
 * apresentação para manter a intenção de busca explícita.
 */
export function getPublicCourseName(title: string) {
  const expanded = title
    .trim()
    .replace(/\bDP\b/gi, "Departamento Pessoal")
    .replace(/^Curso de Prático\b/i, "Curso Prático")
    .replace(/^Curso de Completo\b/i, "Curso Completo");

  if (/^curso\s+de\b/i.test(expanded)) {
    return expanded;
  }

  if (/^curso\b/i.test(expanded)) {
    // Preserve natural constructions such as "Curso Prático" and
    // "Curso Completo". Replacing every leading "Curso" with "Curso de"
    // creates titles grammatically weaker for SEO and for the page H1.
    return expanded;
  }

  return `Curso de ${expanded}`;
}

export function expandDepartmentPersonal(value: string) {
  return value.replace(/\bDP\b/gi, "Departamento Pessoal");
}

export function getCourseMetaDescription(course: Course) {
  const sourceTitle = course.title.toLowerCase();
  const title = getPublicCourseName(course.title);

  if (sourceTitle.includes("esocial") && sourceTitle.includes("leiaute 1.3")) {
    return "Curso prático de atualização do eSocial S-1.3 para órgãos públicos: eventos, prazos e conformidade na prática. Turmas abertas — garanta sua vaga.";
  }

  if (sourceTitle.includes("formação esocial") && sourceTitle.includes("rgps") && sourceTitle.includes("rpps")) {
    return "Formação completa de especialista em eSocial para órgãos públicos: regimes RGPS e RPPS, eventos e obrigações integradas. Inscreva-se na próxima turma.";
  }

  if (sourceTitle.includes("dp na prática") && sourceTitle.includes("clt")) {
    return "Curso de Departamento Pessoal na prática: admissão, folha, férias, rescisão e eSocial, do zero à autonomia total nas rotinas CLT. Certificado incluso.";
  }

  if (sourceTitle.includes("dp administração pública")) {
    return "Curso completo de Departamento Pessoal para a administração pública: folha do setor celetista com controle, conformidade e precisão. Veja a próxima turma.";
  }

  if (sourceTitle.includes("planejamento da contratação")) {
    return "Curso de planejamento da contratação pública: ETP, Termo de Referência, matriz de riscos e plano de fiscalização. Conteúdo prático. Turmas abertas.";
  }

  if (sourceTitle.includes("auditoria da folha de pagamento")) {
    return "Curso de auditoria da folha de pagamento: jornada, rubricas, encargos e riscos trabalhistas. Revisão prática com método. Turmas abertas.";
  }

  return `${title}: ${expandDepartmentPersonal(course.shortDescription)} Turmas abertas — conheça o conteúdo e garanta sua vaga.`;
}

function courseMode(modality: TrainingClass["modality"]) {
  if (modality === "Presencial") return "Onsite";
  if (modality === "Ao vivo online" || modality === "Gravado") return "Online";
  return "Blended";
}

function courseInstanceJsonLd(trainingClass: TrainingClass) {
  const instance: Record<string, unknown> = {
    "@type": "CourseInstance",
    courseMode: courseMode(trainingClass.modality),
    startDate: trainingClass.startDate,
    endDate: trainingClass.endDate
  };

  if (trainingClass.modality === "Presencial" && trainingClass.location) {
    instance.location = {
      "@type": "Place",
      name: trainingClass.location,
      address: trainingClass.location
    };
  }

  return instance;
}

function eventLocationJsonLd(course: Course, trainingClass: TrainingClass) {
  const courseUrl = `${SITE_URL}/cursos/${course.slug}/`;
  const virtualLocation = {
    "@type": "VirtualLocation",
    url: courseUrl
  };

  if (trainingClass.modality === "Ao vivo online" || trainingClass.modality === "Gravado") {
    return {
      eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
      location: virtualLocation
    };
  }

  const physicalLocation = trainingClass.location
    ? {
        "@type": "Place",
        name: trainingClass.location,
        address: trainingClass.location
      }
    : undefined;

  if (trainingClass.modality === "Híbrido") {
    return {
      eventAttendanceMode: "https://schema.org/MixedEventAttendanceMode",
      location: physicalLocation ? [physicalLocation, virtualLocation] : virtualLocation
    };
  }

  return {
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(physicalLocation ? { location: physicalLocation } : {})
  };
}

/**
 * Converte as turmas públicas futuras em eventos Schema.org.
 * `today` é injetável para manter o filtro determinístico nos testes.
 */
export function buildAgendaEventJsonLd(
  courses: Course[],
  classes: TrainingClass[],
  today: string | Date = new Date()
) {
  // Brasil não observa horário de verão desde 2019: offset fixo de -03:00 evita
  // que o filtro de "hoje" avance um dia cedo demais em relação a UTC no fim da tarde/noite.
  const todayKey =
    typeof today === "string" ? today.slice(0, 10) : new Date(today.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const coursesById = new Map(courses.map((course) => [course.id, course]));

  return classes
    .filter((trainingClass) => trainingClass.status !== "Encerrada" && trainingClass.startDate.slice(0, 10) >= todayKey)
    .map((trainingClass) => {
      const course = coursesById.get(trainingClass.courseId);

      if (!course) {
        return null;
      }

      const locationData = eventLocationJsonLd(course, trainingClass);
      const price = trainingClass.price > 0 ? trainingClass.price : course.price;
      const event: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "Event",
        name: getPublicCourseName(course.title),
        description: expandDepartmentPersonal(course.shortDescription || course.fullDescription),
        startDate: trainingClass.startDate,
        eventStatus: "https://schema.org/EventScheduled",
        organizer: {
          "@type": "Organization",
          name: organizationJsonLd.name,
          url: organizationJsonLd.url
        },
        url: `${SITE_URL}/cursos/${course.slug}/`,
        ...locationData
      };

      if (trainingClass.endDate) {
        event.endDate = trainingClass.endDate;
      }

      if (course.image) {
        event.image = course.image.startsWith("http") ? course.image : `${SITE_URL}${course.image.startsWith("/") ? "" : "/"}${course.image}`;
      }

      if (price > 0) {
        event.offers = {
          "@type": "Offer",
          price,
          priceCurrency: "BRL",
          url: `${SITE_URL}/cursos/${course.slug}/`
        };
      }

      return event;
    })
    .filter((event): event is Record<string, unknown> => Boolean(event));
}

export function getCourseFaqItems(course: Course, content?: CoursePublicContent, trainingClass?: TrainingClass) {
  if (content?.faqItems?.length) {
    return content.faqItems;
  }

  return [
    {
      question: "Como faço minha inscrição?",
      answer: trainingClass
        ? `Clique em “Enviar pré-inscrição”, selecione a turma e envie a solicitação para o ${getPublicCourseName(course.title)}.`
        : "Este curso ainda não tem turma aberta. Clique em “Manifestar interesse” para receber a próxima agenda."
    },
    {
      question: "Recebo certificado?",
      answer: `Sim. O ${getPublicCourseName(course.title)} tem carga de ${course.durationLabel} e certificado incluso conforme o fluxo de inscrição.`
    },
    {
      question: "Órgãos públicos podem contratar?",
      answer: "Sim. A RH Cursos atende órgãos públicos e empresas com turmas abertas, treinamentos in company e propostas sob medida."
    }
  ];
}

export function buildCourseJsonLd(
  course: Course,
  classes: TrainingClass[],
  content?: CoursePublicContent
) {
  const courseClasses = classes.filter((trainingClass) => trainingClass.courseId === course.id);
  const faqItems = getCourseFaqItems(course, content, courseClasses[0]);
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: getPublicCourseName(course.title),
    description: expandDepartmentPersonal(course.fullDescription || course.shortDescription),
    provider: organizationJsonLd,
    url: `${SITE_URL}/cursos/${course.slug}/`
  };

  if (courseClasses.length) {
    jsonLd.hasCourseInstance = courseClasses.map(courseInstanceJsonLd);
  }

  return {
    course: jsonLd,
    faq: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer
        }
      }))
    }
  };
}
