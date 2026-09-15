"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Archive, ArrowLeft, Bold, Check, Eye, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, Quote, RemoveFormatting, RotateCcw, Send, Sparkles, Trash2 } from "lucide-react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BlogContent } from "@/components/blog/blog-content";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAdminStore, type BlogTransitionAction } from "@/lib/contexts/admin-context";
import type { BlogPost, BlogStatus } from "@/types";

const categories: BlogPost["category"][] = [
  "Licitações", "LGPD", "Compliance", "Departamento Pessoal", "eSocial",
  "Folha de Pagamento", "Gestão Pública", "Liderança", "Tecnologia", "Assédio e Compliance"
];

type EditorDraft = {
  title: string;
  category: BlogPost["category"];
  author: string;
  summary: string;
  content: string;
  contentFormat: "plain" | "markdown";
  image: string;
  imageAlt: string;
  tags: string;
  readingTime: string;
  relatedCourseId: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogImageUrl: string;
  status: BlogStatus;
  scheduledAt: string;
};

const emptyDraft: EditorDraft = {
  title: "",
  category: "Tecnologia",
  author: "Equipe RH Cursos",
  summary: "",
  content: "",
  contentFormat: "markdown",
  image: "",
  imageAlt: "",
  tags: "",
  readingTime: "5 min",
  relatedCourseId: "",
  seoTitle: "",
  seoDescription: "",
  canonicalUrl: "",
  ogImageUrl: "",
  status: "Rascunho",
  scheduledAt: ""
};

function draftFromPost(post: BlogPost): EditorDraft {
  return {
    title: post.title,
    category: post.category,
    author: post.author,
    summary: post.summary,
    content: post.content,
    contentFormat: post.contentFormat ?? "plain",
    image: post.image,
    imageAlt: post.imageAlt ?? "",
    tags: post.tags.join(", "),
    readingTime: post.readingTime,
    relatedCourseId: post.relatedCourseId,
    seoTitle: post.seoTitle ?? "",
    seoDescription: post.seoDescription ?? "",
    canonicalUrl: post.canonicalUrl ?? "",
    ogImageUrl: post.ogImageUrl ?? "",
    status: post.status,
    scheduledAt: post.scheduledAt ? post.scheduledAt.slice(0, 16) : ""
  };
}

function statusTone(status: BlogStatus): "success" | "warning" | "muted" | "danger" {
  if (status === "Publicado") return "success";
  if (status === "Arquivado") return "danger";
  if (status === "Agendado" || status === "Em revisão") return "warning";
  return "muted";
}

function toPayload(form: EditorDraft, id?: string): Partial<BlogPost> {
  return {
    id,
    title: form.title,
    category: form.category,
    author: form.author,
    summary: form.summary,
    content: form.content,
    contentFormat: form.contentFormat,
    image: form.image,
    imageAlt: form.imageAlt,
    tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    readingTime: form.readingTime,
    relatedCourseId: form.relatedCourseId,
    seoTitle: form.seoTitle,
    seoDescription: form.seoDescription,
    canonicalUrl: form.canonicalUrl,
    ogImageUrl: form.ogImageUrl,
    status: form.status,
    scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null
  };
}

function formatSavedAt(value: Date | null) {
  return value ? `Salvo às ${value.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Ainda não salvo";
}

function selectionRange(textarea: HTMLTextAreaElement | null, value: string) {
  return {
    start: textarea?.selectionStart ?? value.length,
    end: textarea?.selectionEnd ?? value.length
  };
}

function addPrefixToSelectedLines(value: string, start: number, end: number, prefix: string) {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const selectedEnd = value.indexOf("\n", end);
  const lineEnd = selectedEnd === -1 ? value.length : selectedEnd;
  const selected = value.slice(lineStart, lineEnd);
  const next = selected.split("\n").map((line) => line.startsWith(prefix) ? line : `${prefix}${line}`).join("\n");
  return { value: `${value.slice(0, lineStart)}${next}${value.slice(lineEnd)}`, start: lineStart, end: lineStart + next.length };
}

function FormattingToolbar({
  textareaRef,
  value,
  onChange
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string, selection: { start: number; end: number }) => void;
}) {
  const apply = (kind: "bold" | "italic" | "h2" | "h3" | "bullet" | "ordered" | "quote" | "link" | "rule" | "clear") => {
    const textarea = textareaRef.current;
    const { start, end } = selectionRange(textarea, value);
    const selected = value.slice(start, end);
    if (kind === "bold" || kind === "italic") {
      const marker = kind === "bold" ? "**" : "*";
      const inner = selected || "texto destacado";
      const nextValue = `${value.slice(0, start)}${marker}${inner}${marker}${value.slice(end)}`;
      const cursorStart = start + marker.length;
      onChange(nextValue, { start: cursorStart, end: cursorStart + inner.length });
      return;
    }
    if (kind === "link") {
      const inner = selected || "texto do link";
      const token = `[${inner}](https://exemplo.com)`;
      onChange(`${value.slice(0, start)}${token}${value.slice(end)}`, { start: start + 1, end: start + 1 + inner.length });
      return;
    }
    if (kind === "rule") {
      const token = `${start > 0 && value[start - 1] !== "\n" ? "\n\n" : ""}---\n\n`;
      onChange(`${value.slice(0, start)}${token}${value.slice(end)}`, { start: start + token.length, end: start + token.length });
      return;
    }
    if (kind === "clear") {
      const clean = selected.replace(/\*\*|__|[*_`]/g, "").replace(/^#{2,4}\s+|^>\s+|^[-*+]\s+|^\d+[.]\s+/gm, "");
      onChange(`${value.slice(0, start)}${clean}${value.slice(end)}`, { start, end: start + clean.length });
      return;
    }
    const prefix = kind === "h2" ? "## " : kind === "h3" ? "### " : kind === "bullet" ? "- " : kind === "ordered" ? "1. " : "> ";
    const result = addPrefixToSelectedLines(value, start, end, prefix);
    onChange(result.value, { start: result.start, end: result.end });
  };

  const tools = [
    ["bold", Bold, "Negrito"], ["italic", Italic, "Itálico"], ["h2", Heading2, "Subtítulo H2"], ["h3", Heading3, "Subtítulo H3"],
    ["bullet", List, "Lista com marcadores"], ["ordered", ListOrdered, "Lista numerada"], ["quote", Quote, "Citação"], ["link", Link2, "Link"],
    ["rule", Minus, "Separador"], ["clear", RemoveFormatting, "Limpar formatação"]
  ] as const;

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-tk-input border border-b-0 border-tk-line bg-tk-surface-2 p-2" aria-label="Formatação do conteúdo">
      {tools.map(([kind, Icon, label]) => (
        <button key={kind} type="button" title={label} aria-label={label} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-tk-ink-muted transition hover:bg-tk-surface hover:text-tk-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tk-focus" onMouseDown={(event) => event.preventDefault()} onClick={() => apply(kind)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
      <span className="ml-2 text-xs text-tk-ink-muted">Markdown seguro</span>
    </div>
  );
}

export function AdminBlogEditor({ initialPost }: { initialPost?: BlogPost }) {
  const router = useRouter();
  const { saveBlogDraft, saveBlogContent, transitionBlogPost, deleteBlogPost } = useAdminStore();
  const [selectedId, setSelectedId] = useState<string | null>(initialPost?.id ?? null);
  const postIdRef = useRef(initialPost?.id);
  const savingRef = useRef<Promise<string | undefined> | null>(null);
  const [form, setForm] = useState<EditorDraft>(() => initialPost ? draftFromPost(initialPost) : emptyDraft);
  const [preview, setPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const formRef = useRef(form);
  const savedFormRef = useRef(form);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [isDirty, setIsDirty] = useState(false);

  function updateField<K extends keyof EditorDraft>(key: K, value: EditorDraft[K]) {
    const next = { ...formRef.current, [key]: value };
    formRef.current = next;
    setForm(next);
    setIsDirty(true);
    setFeedback(null);
  }

  function updateFormattedContent(value: string, selection: { start: number; end: number }) {
    const next = { ...formRef.current, content: value, contentFormat: "markdown" as const };
    formRef.current = next;
    setForm(next);
    setIsDirty(true);
    setFeedback(null);
    window.requestAnimationFrame(() => {
      contentRef.current?.focus();
      contentRef.current?.setSelectionRange(selection.start, selection.end);
    });
  }

  const persistCurrent = useCallback(async (silent = false): Promise<string | undefined> => {
    // Serialize saves so an autosave and a manual save cannot create two posts.
    if (savingRef.current) await savingRef.current;
    const draft = formRef.current;
    if (savedFormRef.current === draft && postIdRef.current) return postIdRef.current;
    const creating = !postIdRef.current;
    const payload = toPayload(draft, postIdRef.current);
    const pending = draft.status === "Rascunho"
      ? saveBlogDraft(payload, { silent })
      : postIdRef.current
        ? saveBlogContent({ ...payload, id: postIdRef.current, status: draft.status }, { silent })
        : Promise.resolve(undefined);
    savingRef.current = pending;
    try {
      const id = await pending;
      if (!id) throw new Error("Não foi possível confirmar o salvamento do artigo.");
      postIdRef.current = id;
      setSelectedId(id);
      if (creating) router.push(`/admin/blog/${encodeURIComponent(id)}/editar`);
      savedFormRef.current = draft;
      if (formRef.current === draft) setIsDirty(false);
      setSavedAt(new Date());
      return id;
    } finally {
      if (savingRef.current === pending) savingRef.current = null;
    }
  }, [router, saveBlogDraft, saveBlogContent]);

  useEffect(() => {
    if (!isDirty || isSaving || !form.title.trim() || !form.author.trim()) return;
    const timer = setTimeout(() => {
      void persistCurrent(true).catch(() => setFeedback("Não foi possível salvar automaticamente. Tente salvar novamente."));
    }, 1400);
    return () => clearTimeout(timer);
  }, [form, isDirty, isSaving, persistCurrent]);

  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [isDirty]);

  async function returnToArchive() {
    setIsSaving(true);
    try {
      if (isDirty || savingRef.current) await persistCurrent(true);
      router.push("/admin/blog");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível salvar antes de sair.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await persistCurrent();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível salvar o conteúdo.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTransition(action: BlogTransitionAction) {
    setIsSaving(true);
    try {
      const id = await persistCurrent(true);
      const targetId = id ?? selectedId;
      if (!targetId) throw new Error("Salve o rascunho antes de avançar o fluxo editorial.");
      if (action === "schedule") {
        if (!form.scheduledAt || new Date(form.scheduledAt).getTime() <= Date.now()) {
          throw new Error("Informe uma data futura para agendar o post.");
        }
      }
      if ((action === "submit-review" || action === "schedule" || action === "publish") && (form.summary.trim().length < 20 || form.content.trim().length < 100)) {
        throw new Error("Complete o resumo (20 caracteres) e o conteúdo (100 caracteres) antes de publicar.");
      }
      await transitionBlogPost(targetId, action, action === "schedule" ? new Date(form.scheduledAt).toISOString() : undefined);
      const nextStatus: Record<BlogTransitionAction, BlogStatus> = {
        "submit-review": "Em revisão", schedule: "Agendado", publish: "Publicado",
        archive: "Arquivado", restore: "Rascunho"
      };
      const updated = { ...formRef.current, status: nextStatus[action] };
      formRef.current = updated;
      savedFormRef.current = updated;
      setForm(updated);
      setIsDirty(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível avançar o fluxo editorial.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId || !window.confirm("Mover este artigo para a lixeira?")) return;
    setIsSaving(true);
    try {
      if (savingRef.current) await savingRef.current;
      await deleteBlogPost(selectedId);
      setIsDirty(false);
      router.push("/admin/blog");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível excluir o artigo.");
    } finally {
      setIsSaving(false);
    }
  }

  const canSubmitReview = form.status === "Rascunho";
  const canSchedule = form.status === "Rascunho" || form.status === "Em revisão";
  const canPublish = form.status === "Rascunho" || form.status === "Em revisão" || form.status === "Agendado";
  const canArchive = form.status === "Publicado" || form.status === "Agendado" || form.status === "Em revisão";
  const canRestore = form.status === "Arquivado";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-4">
        <Button variant="ghost" className="-ml-4" onClick={() => void returnToArchive()} disabled={isSaving}>
          <ArrowLeft className="h-4 w-4" /> Voltar ao acervo
        </Button>
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-tk-accent-strong">Blog</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-tk-brand">{selectedId ? "Editar artigo" : "Novo artigo"}</h1>
          <p className="mt-3 text-base leading-7 text-tk-ink-muted">Prepare o conteúdo e revise a prévia antes de publicar.</p>
        </div>
      </div>

        <Card>
          <CardHeader className="border-b border-tk-line pb-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>{preview ? "Prévia do artigo" : "Conteúdo do artigo"}</CardTitle>
                <CardDescription className="mt-2">{isDirty ? "Alterações pendentes" : savedAt ? formatSavedAt(savedAt) : selectedId ? "Todas as alterações salvas" : "O rascunho será salvo enquanto você escreve."}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant={preview ? "secondary" : "outline"} size="sm" onClick={() => setPreview((value) => !value)}><Eye className="h-4 w-4" /> {preview ? "Voltar à edição" : "Pré-visualizar"}</Button>
                <Button size="sm" onClick={() => void handleSave()} loading={isSaving}><Check className="h-4 w-4" /> Salvar</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <fieldset disabled={isSaving} className="min-w-0 space-y-6 border-0 p-0">
            {feedback ? <div className="rounded-2xl border border-tk-error/30 bg-tk-error/10 p-4 text-sm font-semibold text-tk-error" role="alert">{feedback}</div> : null}
            {preview ? (
              <article className="space-y-5 rounded-2xl border border-tk-line bg-tk-surface-2 p-6">
                <Badge>{form.category}</Badge>
                <h2 className="text-3xl font-extrabold text-tk-brand">{form.title || "Sem título"}</h2>
                <p className="text-lg leading-8 text-tk-ink-muted">{form.summary || "Resumo ainda não preenchido."}</p>
                <BlogContent content={form.content || "Conteúdo ainda não preenchido."} format={form.contentFormat} className="text-base leading-8 text-tk-ink" />
                <div className="border-t border-tk-line pt-4 text-sm text-tk-ink-muted">Por {form.author || "Autor não informado"} · {form.readingTime || "Tempo não informado"}</div>
              </article>
            ) : (
              <div className="grid items-start gap-5 md:grid-cols-2">
                <div className="md:col-span-2"><Input label="Título" value={form.title} maxLength={240} onChange={(event) => updateField("title", event.target.value)} /></div>
                <label className="grid gap-2 text-sm font-medium text-tk-ink">Categoria<select className="h-11 rounded-tk-input border border-tk-line bg-tk-surface px-4 text-sm" value={form.category} onChange={(event) => updateField("category", event.target.value as BlogPost["category"])}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
                <Input label="Autor" value={form.author} onChange={(event) => updateField("author", event.target.value)} />
                <div className="md:col-span-2"><Textarea label="Resumo" value={form.summary} onChange={(event) => updateField("summary", event.target.value)} hint="Use ao menos 20 caracteres para enviar à revisão." /></div>
                <div className="md:col-span-2">
                  <label className="grid gap-2 text-sm font-medium text-tk-ink" htmlFor="blog-content">Conteúdo</label>
                  <FormattingToolbar textareaRef={contentRef} value={form.content} onChange={updateFormattedContent} />
                  <Textarea id="blog-content" ref={contentRef} value={form.content} onChange={(event) => updateField("content", event.target.value)} className="min-h-[360px] rounded-t-none" hint="Use a barra para formatar. HTML e scripts não são permitidos; o conteúdo é salvo como Markdown seguro." />
                </div>
                <label className="grid gap-2 text-sm font-medium text-tk-ink">Formato<select className="h-11 rounded-tk-input border border-tk-line bg-tk-surface px-4 text-sm" value={form.contentFormat} onChange={(event) => updateField("contentFormat", event.target.value as "plain" | "markdown")}><option value="plain">Texto simples</option><option value="markdown">Markdown seguro</option></select></label>
                <Input label="Tempo de leitura" value={form.readingTime} onChange={(event) => updateField("readingTime", event.target.value)} />
                <Input label="Imagem (URL)" value={form.image} onChange={(event) => updateField("image", event.target.value)} />
                <Input label="Texto alternativo da imagem" value={form.imageAlt} onChange={(event) => updateField("imageAlt", event.target.value)} />
                <div className="md:col-span-2"><Input label="Tags (separadas por vírgula)" value={form.tags} onChange={(event) => updateField("tags", event.target.value)} /></div>
                <div className="md:col-span-2 border-t border-tk-line pt-5"><p className="font-bold text-tk-brand">SEO e distribuição</p><p className="mt-1 text-sm text-tk-ink-muted">Personalize como o artigo aparece nas buscas e ao compartilhar o link.</p></div>
                <Input label="Título SEO" value={form.seoTitle} maxLength={240} onChange={(event) => updateField("seoTitle", event.target.value)} />
                <Input label="URL canônica" value={form.canonicalUrl} onChange={(event) => updateField("canonicalUrl", event.target.value)} />
                <div className="md:col-span-2"><Textarea label="Descrição SEO" value={form.seoDescription} maxLength={320} onChange={(event) => updateField("seoDescription", event.target.value)} /></div>
                <Input label="Imagem Open Graph (URL)" value={form.ogImageUrl} onChange={(event) => updateField("ogImageUrl", event.target.value)} />
                <Input label="Data de agendamento" type="datetime-local" value={form.scheduledAt} onChange={(event) => updateField("scheduledAt", event.target.value)} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-tk-line pt-5">
              <Badge variant={statusTone(form.status)} dot>{form.status}</Badge>
              <span className="text-sm text-tk-ink-muted">Escolha a próxima etapa do artigo.</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {canSubmitReview ? <Button variant="outline" onClick={() => void handleTransition("submit-review")} disabled={isSaving}><Send className="h-4 w-4" /> Enviar para revisão</Button> : null}
              {canSchedule ? <Button variant="outline" onClick={() => void handleTransition("schedule")} disabled={isSaving}><Sparkles className="h-4 w-4" /> Agendar</Button> : null}
              {canPublish ? <Button variant="success" onClick={() => void handleTransition("publish")} disabled={isSaving}><Check className="h-4 w-4" /> Publicar agora</Button> : null}
              {canArchive ? <Button variant="danger" onClick={() => void handleTransition("archive")} disabled={isSaving}><Archive className="h-4 w-4" /> Arquivar</Button> : null}
              {canRestore ? <Button variant="outline" onClick={() => void handleTransition("restore")} disabled={isSaving}><RotateCcw className="h-4 w-4" /> Restaurar como rascunho</Button> : null}
              {selectedId ? <Button variant="ghost" className="ml-auto text-tk-error" onClick={() => void handleDelete()}><Trash2 className="h-4 w-4" /> Excluir</Button> : null}
            </div>
            </fieldset>
          </CardContent>
        </Card>
    </div>
  );
}

export function AdminBlogEditPage({ postId }: { postId: string }) {
  const { blogPosts } = useAdminStore();
  const post = blogPosts.find((item) => item.id === postId);
  if (!post) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Artigo não encontrado</CardTitle>
          <CardDescription>O artigo pode ter sido removido ou estar indisponível.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline"><Link href="/admin/blog"><ArrowLeft className="h-4 w-4" /> Voltar ao acervo</Link></Button>
        </CardContent>
      </Card>
    );
  }
  return <AdminBlogEditor key={post.id} initialPost={post} />;
}
