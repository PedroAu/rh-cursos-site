import type { Metadata } from "next";

import { PublicPageShell } from "@/components/next-page-shell";
import { CoursesPage } from "@/features/public/courses/courses-page";
import {
  fetchPublicCatalogServerState,
} from "@/lib/supabase/rh-cursos-api";
import { getServerPublicTestBaselineEnabled } from "@/lib/public-test-baseline-server";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Cursos para Servidores Públicos e Empresas — Presenciais e Online | RH Cursos",
  description:
    "Catálogo de cursos com certificado: eSocial, Departamento Pessoal, folha de pagamento, licitações (Lei 14.133), tributos e gestão pública. Turmas abertas.",
  alternates: { canonical: "/cursos" },
  openGraph: {
    title: "Cursos para Servidores Públicos e Empresas | RH Cursos",
    description: "Catálogo de cursos presenciais e online com certificado para órgãos públicos e empresas.",
    url: "/cursos",
    type: "website"
  }
};

export default async function Page() {
  const usePublicTestBaseline = await getServerPublicTestBaselineEnabled();
  const catalogState = await fetchPublicCatalogServerState(usePublicTestBaseline);

  if (catalogState.status === "unavailable") {
    console.error("Falha ao carregar catálogo público na rota /cursos:", catalogState.error);
    throw catalogState.error;
  }

  return (
    <PublicPageShell
      initialData={{
        courses: catalogState.catalog.courses,
        classes: catalogState.catalog.classes,
        instructors: catalogState.catalog.instructors,
        trainingPaths: catalogState.catalog.trainingPaths,
        coursePublicContents: catalogState.catalog.coursePublicContents,
        courseCategories: catalogState.catalog.courseCategories,
      }}
    >
      <CoursesPage />
    </PublicPageShell>
  );
}
