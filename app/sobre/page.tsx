import type { Metadata } from "next";

import { PublicPageShell } from "@/components/next-page-shell";
import { AboutPage } from "@/features/public/about/about-page";
import {
  fetchPublicCatalogServerState,
} from "@/lib/supabase/rh-cursos-api";
import { getServerPublicTestBaselineEnabled } from "@/lib/public-test-baseline-server";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Quem Somos — RH Cursos & Soluções, desde 2007 em Brasília | RH Cursos",
  description:
    "Conheça a RH Cursos & Soluções: empresa de capacitação e consultoria fundada em 2007 em Brasília-DF, com atuação nacional no setor público e privado.",
  alternates: { canonical: "/sobre" },
  openGraph: {
    title: "Quem Somos | RH Cursos & Soluções",
    description: "Capacitação e consultoria para o setor público e privado desde 2007.",
    url: "/sobre",
    type: "website"
  }
};

export default async function Page() {
  const usePublicTestBaseline = await getServerPublicTestBaselineEnabled();
  const catalogState = await fetchPublicCatalogServerState(usePublicTestBaseline);

  if (catalogState.status === "unavailable") {
    console.error("Falha ao carregar catálogo público na rota /sobre:", catalogState.error);
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
        courseCategories: catalogState.catalog.courseCategories
      }}
    >
      <AboutPage />
    </PublicPageShell>
  );
}
