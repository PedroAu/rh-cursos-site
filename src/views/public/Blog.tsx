"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useHotkey } from "@/hooks/use-hotkey";
import { useAppStore } from "@/lib/app-store";
import {
  isClientPublicTestBaselineEnabled,
  isExplicitPublicTestBaselineEnabled
} from "@/lib/supabase/rh-cursos-api";
import { publicTestBaselineBlogPosts } from "@/lib/public-test-baseline";
import { Link, useSearchParams } from "@/lib/router-compat";
import type { BlogPost } from "@/types";
import { cn, formatDate } from "@/lib/utils";

const canvasCategories = [
  "Todos",
  "eSocial",
  "Folha de Pagamento",
  "Departamento Pessoal",
  "Gestão Pública",
  "Licitações",
  "LGPD",
  "Compliance"
] as const;

const categoryPresentation: Record<string, { glyph: string; tint: string }> = {
  Compliance: {
    glyph: "✓",
    tint: "linear-gradient(135deg,color-mix(in_srgb,var(--tk-brand) 60%,var(--tk-focus)),color-mix(in_srgb,var(--tk-focus) 78%,white))"
  },
  "Departamento Pessoal": {
    glyph: "•",
    tint: "linear-gradient(135deg,color-mix(in_srgb,var(--rh-gray) 88%,var(--tk-brand)),color-mix(in_srgb,var(--rh-gray) 62%,white))"
  },
  eSocial: {
    glyph: "•",
    tint: "linear-gradient(135deg,color-mix(in_srgb,var(--rh-gray) 88%,var(--tk-brand)),color-mix(in_srgb,var(--rh-gray) 62%,white))"
  },
  "Folha de Pagamento": {
    glyph: "≡",
    tint: "linear-gradient(135deg,color-mix(in_srgb,var(--tk-accent) 66%,var(--tk-brand)),color-mix(in_srgb,var(--tk-focus) 60%,white))"
  },
  "Gestão Pública": {
    glyph: "◇",
    tint: "linear-gradient(135deg,color-mix(in_srgb,var(--tk-brand) 72%,var(--tk-accent)),var(--tk-success))"
  },
  LGPD: {
    glyph: "◆",
    tint: "linear-gradient(135deg,var(--tk-accent),color-mix(in_srgb,var(--tk-accent) 72%,white))"
  },
  Liderança: {
    glyph: "✦",
    tint: "linear-gradient(135deg,color-mix(in_srgb,var(--tk-brand) 34%,var(--tk-cream-dark)),color-mix(in_srgb,var(--tk-cream-dark) 82%,white))"
  },
  Licitações: {
    glyph: "§",
    tint: "linear-gradient(135deg,var(--tk-brand),color-mix(in_srgb,var(--tk-brand) 76%,var(--tk-accent)))"
  },
  Tecnologia: {
    glyph: "◈",
    tint: "linear-gradient(135deg,color-mix(in_srgb,var(--tk-accent) 58%,var(--tk-focus)),color-mix(in_srgb,var(--tk-focus) 72%,white))"
  }
};

function normalizeBlogCategory(category: BlogPost["category"]) {
  const aliases: Partial<Record<BlogPost["category"], (typeof canvasCategories)[number]>> = {
    "Departamento Pessoal": "Departamento Pessoal",
    eSocial: "eSocial",
    "Folha de Pagamento": "Folha de Pagamento",
    Liderança: "Todos",
    Tecnologia: "Todos",
    "Assédio e Compliance": "Compliance",
    Compliance: "Compliance",
    "Gestão Pública": "Gestão Pública",
    LGPD: "LGPD",
    Licitações: "Licitações"
  };

  return aliases[category] ?? "Todos";
}

function normalizeCategoryParam(value: string | null): (typeof canvasCategories)[number] {
  return canvasCategories.includes(value as (typeof canvasCategories)[number])
    ? value as (typeof canvasCategories)[number]
    : "Todos";
}

function getPresentation(post: BlogPost) {
  return categoryPresentation[post.category] ?? {
    glyph: "•",
    tint: "linear-gradient(135deg,var(--tk-brand),color-mix(in_srgb,var(--tk-brand) 76%,var(--tk-accent)))"
  };
}

function SectionEyebrow({ children }: { children: string }) {
  return (
    <Badge tone="accent" className="w-fit px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">{children}</Badge>
  );
}

export function BlogPage() {
  const { blogPosts, createLead } = useAppStore();
  const publicBaselineEnabled =
    isExplicitPublicTestBaselineEnabled() ||
    isClientPublicTestBaselineEnabled();
  const effectiveBlogPosts = blogPosts.length || !publicBaselineEnabled ? blogPosts : publicTestBaselineBlogPosts;
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const urlQuery = searchParams.get("q") ?? "";
  const urlCategory = normalizeCategoryParam(searchParams.get("category"));
  // Keep the server and first client render deterministic; URL state is
  // applied by the synchronization effect immediately after hydration.
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof canvasCategories)[number]>("Todos");
  const [newsletterName, setNewsletterName] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [isSubmittingNewsletter, setIsSubmittingNewsletter] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const syncingFromUrlRef = useRef(false);
  const debouncedQuery = useDebouncedValue(query);

  useEffect(() => {
    if (effectiveBlogPosts.length > 0) {
      setIsInitialLoading(false);
      return;
    }

    const timer = window.setTimeout(() => setIsInitialLoading(false), 450);
    return () => window.clearTimeout(timer);
  }, [effectiveBlogPosts.length]);

  useEffect(() => {
    syncingFromUrlRef.current = true;
    setQuery(urlQuery);
    setCategory(urlCategory);
  }, [searchParamsKey, urlCategory, urlQuery]);

  useEffect(() => {
    if (syncingFromUrlRef.current) {
      if (debouncedQuery !== urlQuery || category !== urlCategory) {
        return;
      }

      syncingFromUrlRef.current = false;
    }

    const params: Record<string, string> = {};
    if (debouncedQuery) params.q = debouncedQuery;
    if (category !== "Todos") params.category = category;

    if (urlQuery === (params.q ?? "") && (urlCategory === "Todos" ? "" : urlCategory) === (params.category ?? "")) {
      return;
    }

    setSearchParams(params);
  }, [category, debouncedQuery, setSearchParams, urlCategory, urlQuery]);

  useHotkey(
    (event) => event.key === "/" && !["INPUT", "TEXTAREA"].includes((event.target as HTMLElement).tagName),
    (event) => {
      event.preventDefault();
      searchRef.current?.focus();
    }
  );

  const publishedPosts = useMemo(
    () =>
      [...effectiveBlogPosts]
        .filter((post) => post.status === "Publicado")
        .sort((left, right) => right.date.localeCompare(left.date)),
    [effectiveBlogPosts]
  );

  const filteredPosts = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase();

    return publishedPosts.filter((post) => {
      const displayCategory = normalizeBlogCategory(post.category);
      const matchesCategory = category === "Todos" || displayCategory === category;
      const haystack = [post.title, post.summary, post.author, post.category, ...post.tags].join(" ").toLowerCase();
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);

      return matchesCategory && matchesQuery;
    });
  }, [category, debouncedQuery, publishedPosts]);

  const featuredPost = filteredPosts[0];
  const gridPosts = filteredPosts.filter((post) => post.slug !== featuredPost?.slug).slice(0, 9);
  const trendingItems = useMemo(
    () =>
      publishedPosts
        .slice(0, 4)
        .map((post) => ({
          slug: post.slug,
          title: post.title,
          category: normalizeBlogCategory(post.category),
          read: `${post.readingTime} de leitura`
        })),
    [publishedPosts]
  );
  const visibleCount = filteredPosts.length;

  const submitNewsletter = async () => {
    if (!newsletterName.trim()) {
      toast.error("Informe seu nome para continuar.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newsletterEmail)) {
      toast.error("Informe um e-mail válido para continuar.");
      return;
    }

    try {
      setIsSubmittingNewsletter(true);
      await createLead({
        name: newsletterName.trim(),
        email: newsletterEmail.trim(),
        phone: "",
        type: "Newsletter",
        courseInterest: "Newsletter",
        origin: "Blog",
        message: "Cadastro de newsletter pelo blog."
      });
      setNewsletterName("");
      setNewsletterEmail("");
      toast.success("Cadastro concluído para a newsletter.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir o cadastro.");
    } finally {
      setIsSubmittingNewsletter(false);
    }
  };

  return (
    <div className="bg-tk-surface text-tk-ink">
      <section className="border-b border-tk-line bg-[image:var(--tk-gradient-soft)]">
        <div className="mx-auto w-[min(var(--tk-container),calc(100%-24px))] py-14 md:w-[min(var(--tk-container),calc(100%-40px))] md:py-16">
          <SectionEyebrow>Conteúdo · Análises · Prática</SectionEyebrow>
          <h1 className="mt-5 max-w-[12ch] font-tk-display text-[2.7rem] font-bold leading-[1.02] tracking-[-0.03em] text-tk-ink md:text-[3rem]">
            Blog: a norma explicada de um jeito que você <em className="italic">usa</em>
          </h1>
          <p className="mt-4 max-w-[60ch] font-tk-serif text-[1.16rem] font-normal leading-[1.45] text-tk-ink-muted">
            Análises práticas de eSocial, folha de pagamento e Departamento Pessoal para organizações públicas,
            escritas para apoiar decisões que acontecem na rotina.
          </p>
        </div>
      </section>

      <section className="py-14">
        <div className="mx-auto w-[min(var(--tk-container),calc(100%-24px))] md:w-[min(var(--tk-container),calc(100%-40px))]">
          {featuredPost ? (
            <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
              <Card className="overflow-hidden rounded-tk-card border-tk-line bg-tk-surface">
                <div
                  className="relative flex h-[300px] items-start overflow-hidden px-8 py-7 text-white"
                  style={{ background: getPresentation(featuredPost).tint }}
                >
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
                    <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
                    Em destaque · {featuredPost.category}
                  </span>
                  <span className="absolute bottom-3 right-4 font-tk-display text-[96px] font-bold leading-none tracking-[var(--tk-tracking-display)] text-white/25">
                    {getPresentation(featuredPost).glyph}
                  </span>
                </div>
                <CardContent className="flex h-[calc(100%-300px)] flex-col gap-4 p-8">
                  <p className="text-sm text-tk-ink-muted">
                    {featuredPost.author} · {formatDate(featuredPost.date)} · {featuredPost.readingTime} de leitura
                  </p>
                  <h2 className="max-w-[18ch] font-tk-display text-[var(--tk-text-display)] font-bold leading-[1.12] tracking-[-0.025em] text-tk-ink">
                    {featuredPost.title}
                  </h2>
                  <p className="max-w-[44ch] font-tk-serif text-[1.08rem] font-normal leading-[1.5] text-tk-ink-muted">
                    {featuredPost.summary}
                  </p>
                  <Link to={`/blog/${featuredPost.slug}`} className="mt-auto font-semibold text-tk-accent-strong">
                    Ler artigo completo →
                  </Link>
                </CardContent>
              </Card>

              <Card className="rounded-tk-card border-tk-line bg-tk-surface">
                <CardContent className="p-7">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-tk-error" aria-hidden />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-tk-ink-muted">Em alta esta semana</p>
                  </div>
                  <div className="mt-5">
                    {trendingItems.map((item, index) => (
                      <Link
                        key={item.slug}
                        to={`/blog/${item.slug}`}
                        className={cn(
                          "flex gap-4 py-4 transition hover:text-tk-accent-strong",
                          index < trendingItems.length - 1 && "border-b border-tk-line"
                        )}
                      >
                        <span className="w-6 font-tk-display text-2xl font-bold text-[var(--rh-paper-line)]">{index + 1}</span>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-tk-accent-strong">{item.category}</p>
                          <p className="mt-1 font-tk-display text-base font-bold leading-[1.28] tracking-[-0.01em] text-tk-ink">
                            {item.title}
                          </p>
                          <p className="mt-1 text-xs text-tk-ink-muted">{item.read}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </section>

      <section className="pb-6">
        <div className="mx-auto w-[min(var(--tk-container),calc(100%-24px))] md:w-[min(var(--tk-container),calc(100%-40px))]">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="font-tk-display text-[2rem] font-bold tracking-[-0.02em] text-tk-ink">Últimos artigos</h2>
              <p className="mt-1 text-sm text-tk-ink-muted">{visibleCount} publicações · atualizado toda semana</p>
            </div>
            <div role="search" className="flex w-full max-w-[420px] items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-tk-ink-muted" />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por tema ou palavra-chave"
                  className="h-12 rounded-tk-field-lg pl-11"
                  aria-label="Buscar por tema ou palavra-chave"
                />
              </div>
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="rounded-tk-field-lg border border-tk-line px-3 py-3 text-sm font-medium text-tk-ink-muted transition hover:border-[var(--rh-paper-line)] hover:text-tk-ink"
                  aria-label="Limpar busca do blog"
                >
                  Limpar
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {canvasCategories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-semibold transition",
                  category === item
                    ? "border-tk-brand bg-tk-brand text-tk-surface"
                    : "border-tk-line bg-tk-surface text-tk-ink-muted hover:border-[var(--rh-paper-line)] hover:text-tk-ink"
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="mx-auto w-[min(var(--tk-container),calc(100%-24px))] md:w-[min(var(--tk-container),calc(100%-40px))]">
          {isInitialLoading ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-[420px] animate-pulse rounded-tk-card bg-tk-surface-2" />
              ))}
            </div>
          ) : filteredPosts.length ? (
            gridPosts.length ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {gridPosts.map((post) => {
                const presentation = getPresentation(post);

                return (
                  <Link key={post.id} to={`/blog/${post.slug}`} className="block">
                    <Card interactive className="h-full overflow-hidden rounded-tk-card border-tk-line bg-tk-surface transition hover:-translate-y-1">
                      <div className="relative h-[158px] px-5 py-4 text-white" style={{ background: presentation.tint }}>
                        <span className="inline-flex rounded-full bg-white/18 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
                          {post.category}
                        </span>
                        <span className="absolute bottom-2 right-4 font-tk-display text-[56px] font-bold leading-none tracking-[var(--tk-tracking-display)] text-white/30">
                          {presentation.glyph}
                        </span>
                      </div>
                      <CardContent className="flex h-[calc(100%-158px)] flex-col gap-3 p-6">
                        <h3 className="font-tk-display text-[1.8rem] font-bold leading-[1.15] tracking-[-0.02em] text-tk-ink">
                          {post.title}
                        </h3>
                        <p className="text-sm leading-7 text-tk-ink-muted">{post.summary}</p>
                        <p className="mt-auto pt-2 text-sm text-tk-ink-muted">
                          {post.author} · {formatDate(post.date)} · {post.readingTime}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
            ) : null
          ) : (
            <Card className="rounded-tk-card border-tk-line bg-tk-surface">
              <CardContent className="p-10 text-center">
                <h3 className="font-tk-display text-[1.5rem] font-bold text-tk-ink">Nenhum artigo encontrado</h3>
                <p className="mt-3 text-sm text-tk-ink-muted">Tente outra palavra-chave ou categoria.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <section className="border-y border-[var(--rh-paper-line)] bg-[var(--rh-paper-a)] py-16">
        <div className="mx-auto grid w-[min(var(--tk-container),calc(100%-24px))] gap-10 md:w-[min(var(--tk-container),calc(100%-40px))] lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <Badge tone="neutral" className="w-fit border-transparent bg-tk-brand px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-tk-surface">
              Newsletter quinzenal
            </Badge>
            <h2 className="mt-5 max-w-[12ch] font-tk-display text-[2.5rem] font-bold leading-[1.05] tracking-[-0.03em] text-tk-ink">
              Receba a leitura certa antes da <em className="italic">próxima</em> mudança
            </h2>
            <p className="mt-4 max-w-[36ch] font-tk-serif text-[1.12rem] font-normal leading-[1.5] text-tk-ink-muted">
              Uma edição a cada duas semanas com o que mudou nas normas, o que fazer a respeito e os artigos que valem
              o seu tempo. Sem spam.
            </p>
          </div>

          <Card className="rounded-tk-card border-tk-line bg-tk-surface">
            <CardContent className="space-y-4 p-8">
              <Input
                value={newsletterName}
                onChange={(event) => setNewsletterName(event.target.value)}
                placeholder="Seu nome"
                aria-label="Seu nome"
              />
              <Input
                type="email"
                value={newsletterEmail}
                onChange={(event) => setNewsletterEmail(event.target.value)}
                placeholder="Seu melhor e-mail"
                aria-label="Seu melhor e-mail"
              />
              <Button className="w-full" size="lg" loading={isSubmittingNewsletter} onClick={submitNewsletter}>
                Quero receber →
              </Button>
              <p className="text-center text-xs text-tk-ink-muted">+4.200 profissionais já recebem. Cancele quando quiser.</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
