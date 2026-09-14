import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BlogPostClient } from "@/components/page-clients/blog-post-client";
import {
  fetchPublicBlogPostsFromSupabaseServer,
  fetchPublicCatalogFromSupabaseServer,
  isPublicTestBaselineBuildEnabled
} from "@/lib/supabase/rh-cursos-api";
import { publicTestBaselineBlogPosts } from "@/lib/public-test-baseline";
import { SITE_URL } from "@/lib/seo";

type PageProps = {
  params: Promise<{ slug: string }>;
};

async function getBlogPosts() {
  try {
    return await fetchPublicBlogPostsFromSupabaseServer(isPublicTestBaselineBuildEnabled()) ?? [];
  } catch {
    return [];
  }
}

export async function generateStaticParams() {
  return (await getBlogPosts()).map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = (await getBlogPosts()).find((item) => item.slug === slug);

  if (!post) {
    return {
      title: "Post não encontrado | RH Cursos"
    };
  }

  return {
    title: `${post.seoTitle ?? post.title} | RH Cursos`,
    description: post.seoDescription ?? post.summary,
    alternates: { canonical: post.canonicalUrl ?? `/blog/${post.slug}` },
    openGraph: {
      title: `${post.seoTitle ?? post.title} | RH Cursos`,
      description: post.seoDescription ?? post.summary,
      url: post.canonicalUrl ?? `${SITE_URL}/blog/${post.slug}/`,
      type: "article",
      publishedTime: post.date,
      authors: [post.author],
      ...(post.ogImageUrl || post.image ? { images: [post.ogImageUrl ?? post.image] } : {})
    }
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const usePublicTestBaseline =
    process.env.PLAYWRIGHT_TEST_BUILD === "1" || isPublicTestBaselineBuildEnabled();
  const [blogPosts, catalog] = await Promise.all([
    usePublicTestBaseline
      ? Promise.resolve(publicTestBaselineBlogPosts)
      : fetchPublicBlogPostsFromSupabaseServer(false),
    fetchPublicCatalogFromSupabaseServer(usePublicTestBaseline).catch(() => null)
  ]);

  if (!(blogPosts ?? []).some((item) => item.slug === slug)) {
    notFound();
  }

  const post = (blogPosts ?? []).find((item) => item.slug === slug);
  const jsonLd = post
    ? {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.summary,
        datePublished: post.date,
        dateModified: post.date,
        author: { "@type": "Person", name: post.author },
        ...(post.image || post.ogImageUrl ? { image: [post.ogImageUrl ?? post.image] } : {}),
        mainEntityOfPage: `${SITE_URL}/blog/${post.slug}/`
      }
    : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      ) : null}
      <BlogPostClient
        initialData={{
          blogPosts: blogPosts ?? [],
          courses: catalog?.courses ?? []
        }}
      />
    </>
  );
}
