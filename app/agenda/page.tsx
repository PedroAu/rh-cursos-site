import type { Metadata } from "next";

import { PublicPageShell } from "@/components/next-page-shell";
import { AgendaPage } from "@/features/public/agenda/agenda-page";
import { buildAgendaEventJsonLd } from "@/lib/seo";
import {
  fetchPublicCatalogServerState,
} from "@/lib/supabase/rh-cursos-api";
import { getServerPublicTestBaselineEnabled } from "@/lib/public-test-baseline-server";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Agenda de Cursos e Treinamentos Presenciais e Online | RH Cursos",
  description:
    "Confira as próximas turmas de cursos presenciais e online da RH Cursos: eSocial, Departamento Pessoal, licitações, gestão pública e outros temas.",
  alternates: { canonical: "/agenda" },
  openGraph: {
    title: "Agenda de Cursos e Treinamentos | RH Cursos",
    description: "Próximas turmas presenciais e online da RH Cursos.",
    url: "/agenda",
    type: "website"
  }
};

export default async function Page() {
  const usePublicTestBaseline = await getServerPublicTestBaselineEnabled();
  const catalogState = await fetchPublicCatalogServerState(usePublicTestBaseline);

  if (catalogState.status === "unavailable") {
    console.error("Falha ao carregar catálogo público na rota /agenda:", catalogState.error);
    throw catalogState.error;
  }

  const agendaEvents = buildAgendaEventJsonLd(catalogState.catalog.courses, catalogState.catalog.classes);

  return (
    <>
      {agendaEvents.length ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(agendaEvents).replace(/</g, "\\u003c") }}
        />
      ) : null}
      <PublicPageShell
        initialData={{
          courses: catalogState.catalog.courses,
          classes: catalogState.catalog.classes,
          instructors: catalogState.catalog.instructors,
          trainingPaths: catalogState.catalog.trainingPaths,
          coursePublicContents: catalogState.catalog.coursePublicContents,
          courseCategories: catalogState.catalog.courseCategories
        }}
      >
        <AgendaPage />
      </PublicPageShell>
    </>
  );
}
