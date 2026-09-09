import type { Metadata } from "next";

import { PublicPageShell } from "@/components/next-page-shell";
import { BlogPage } from "@/features/public/blog/blog-page";
import {
  fetchPublicBlogPostsFromSupabaseServer,
} from "@/lib/supabase/rh-cursos-api";
import { getServerPublicTestBaselineEnabled } from "@/lib/public-test-baseline-server";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Blog RH Cursos — eSocial, Departamento Pessoal, Licitações e Gestão Pública",
  description:
    "Artigos práticos sobre eSocial, Departamento Pessoal, licitações, gestão pública, LGPD e compliance para aplicar a norma com segurança.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Blog RH Cursos — eSocial, Departamento Pessoal, Licitações e Gestão Pública",
    description: "A norma explicada de um jeito que você usa.",
    url: "/blog",
    type: "website"
  }
};

export default async function Page() {
  const usePublicTestBaseline = await getServerPublicTestBaselineEnabled();
  const blogPosts = await fetchPublicBlogPostsFromSupabaseServer(usePublicTestBaseline).catch(() => null);

  return (
    <PublicPageShell initialData={{ blogPosts: blogPosts ?? undefined }}>
      <BlogPage />
    </PublicPageShell>
  );
}
