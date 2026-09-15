"use client";

import { ArrowRight, CalendarDays, Clock3 } from "lucide-react";
import { Link, useParams } from "@/lib/router-compat";
import { usePathname } from "next/navigation";

import { BlogCard } from "@/components/blog/blog-card";
import { BlogContent, blogContentToText } from "@/components/blog/blog-content";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppStore } from "@/lib/app-store";
import { formatDate } from "@/lib/utils";
import { publicTestBaselineBlogPosts } from "@/lib/public-test-baseline";

export function BlogPostPage() {
  const { slug: slugParam } = useParams();
  const pathname = usePathname();
  const runtimePathname = typeof window !== "undefined" ? window.location.pathname : pathname;
  const pathnameSlug = runtimePathname.split("/").filter(Boolean).at(-1);
  const slug = pathnameSlug ?? (Array.isArray(slugParam) ? slugParam[0] : slugParam);
  const { blogPosts, courses } = useAppStore();

  const post = blogPosts.find((item) => item.slug === slug) ??
    publicTestBaselineBlogPosts.find((item) =>
      item.slug === slug || runtimePathname.includes(item.slug)
    );
  const safeContent = blogContentToText(post?.content ?? "", post?.contentFormat ?? "plain");
  const relatedPosts = blogPosts.filter((item) => item.slug !== slug && item.category === post?.category).slice(0, 3);
  const relatedCourse = courses.find((course) => course.id === post?.relatedCourseId);
  const leadParagraphs = safeContent.split("\n\n").slice(0, 3);

  if (!post) {
    return (
      <section className="page-section">
        <div className="container">
          <EmptyState title="Post não encontrado." description="Volte ao blog para explorar os conteúdos disponíveis." />
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="bg-tk-surface py-14 md:py-16">
        <div className="mx-auto grid w-[min(var(--tk-container),calc(100%-24px))] gap-8 md:w-[min(var(--tk-container),calc(100%-40px))] xl:grid-cols-[1.1fr_0.9fr]">
          <article className="space-y-8">
            <div className="space-y-4">
              <Badge tone="accent" className="w-fit px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
                {post.category}
              </Badge>
              <h1 className="max-w-[16ch] font-tk-display text-[2.6rem] font-bold leading-[1.05] tracking-[-0.03em] text-tk-ink md:text-[3rem]">
                {post.title}
              </h1>
              <p className="max-w-[44ch] font-tk-serif text-lg leading-8 text-tk-ink-muted">{post.summary}</p>
              <div className="flex flex-wrap gap-4 text-sm text-tk-ink-muted">
                <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{formatDate(post.date)}</div>
                <div className="flex items-center gap-2"><Clock3 className="h-4 w-4" />{post.readingTime}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-tk-line bg-tk-surface-2 px-3 py-1.5 text-sm font-semibold text-tk-ink">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <Card className="border-tk-line bg-tk-surface">
              <CardContent className="space-y-5 p-7 md:p-10">
                <BlogContent content={post.content} format={post.contentFormat ?? "plain"} className="mx-auto max-w-3xl text-base leading-8 text-tk-ink-muted" />
              </CardContent>
            </Card>
          </article>

          <div className="space-y-6">
            <Card className="border-tk-line bg-tk-surface-2">
              <CardContent className="space-y-4 p-6">
                <div className="text-sm uppercase tracking-[0.18em] text-tk-ink-muted">Leitura guiada</div>
                <ul className="space-y-3 text-sm leading-6 text-tk-ink-muted">
                  {leadParagraphs.map((paragraph, index) => (
                    <li key={paragraph} className="flex gap-3">
                      <span className="mt-0.5 font-bold text-tk-ink">{index + 1}.</span>
                      <span>{paragraph}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card className="bg-tk-brand text-white">
              <CardContent className="space-y-4 p-6">
                <div className="text-sm uppercase tracking-[0.18em] text-white/72">CTA relacionado</div>
                <h3 className="font-tk-display text-2xl font-bold text-white">
                  {relatedCourse?.title ?? "Curso relacionado indisponível no momento"}
                </h3>
                <p className="text-sm leading-6 text-white/82">
                  Conecte o conteúdo do artigo à jornada comercial com um CTA direto para o curso relacionado.
                </p>
                {relatedCourse ? (
                  <Button asChild className="bg-white text-tk-brand hover:bg-white/90">
                    <Link to={`/cursos/${relatedCourse.slug}`}>
                      Ver curso relacionado
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-tk-line bg-tk-surface">
              <CardContent className="space-y-4 p-6">
                <div className="text-sm uppercase tracking-[0.18em] text-tk-ink-muted">Taxonomia</div>
                <div className="space-y-3 text-sm leading-6 text-tk-ink-muted">
                  <p><strong className="text-tk-ink">Categoria:</strong> {post.category}</p>
                  <p><strong className="text-tk-ink">Autor:</strong> {post.author}</p>
                  <p><strong className="text-tk-ink">Leitura estimada:</strong> {post.readingTime}</p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div>
                <Badge tone="accent" className="w-fit px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Relacionados
                </Badge>
                <h2 className="mt-3 font-tk-display text-[1.75rem] font-bold leading-tight text-tk-ink">
                  Outros conteúdos da mesma categoria
                </h2>
              </div>
              {relatedPosts.length ? (
                <div className="grid gap-4">
                  {relatedPosts.map((item) => (
                    <BlogCard key={item.id} post={item} />
                  ))}
                </div>
              ) : (
                <Card className="border-tk-line bg-tk-surface">
                  <CardContent className="p-6 text-sm text-tk-ink-muted">
                    Nenhum outro artigo relacionado foi publicado nesta categoria até agora.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
