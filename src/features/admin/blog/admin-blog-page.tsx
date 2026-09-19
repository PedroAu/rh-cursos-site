"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, FileText, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAdminStore } from "@/lib/contexts/admin-context";
import type { BlogStatus } from "@/types";

const statuses: BlogStatus[] = ["Rascunho", "Em revisão", "Agendado", "Publicado", "Arquivado"];

function statusTone(status: BlogStatus): "success" | "warning" | "muted" | "danger" {
  if (status === "Publicado") return "success";
  if (status === "Arquivado") return "danger";
  if (status === "Agendado" || status === "Em revisão") return "warning";
  return "muted";
}

export function AdminBlogPage() {
  const { blogPosts } = useAdminStore();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BlogStatus | "Todos">("Todos");
  const publishedPosts = blogPosts.filter((post) => post.status === "Publicado").length;
  const filteredPosts = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    return blogPosts.filter((post) =>
      (statusFilter === "Todos" || post.status === statusFilter) &&
      (!normalized || [post.title, post.author, post.category].some((value) =>
        value.toLocaleLowerCase("pt-BR").includes(normalized)))
    );
  }, [blogPosts, search, statusFilter]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-tk-accent-strong">Conteúdo editorial</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-tk-brand">Blog</h1>
          <p className="mt-3 text-base leading-7 text-tk-ink-muted">
            {blogPosts.length} {blogPosts.length === 1 ? "post" : "posts"} no acervo · {publishedPosts} {publishedPosts === 1 ? "publicado" : "publicados"} no site
          </p>
        </div>
        <Button className="self-start" onClick={() => router.push("/admin/blog/novo")}><Plus className="h-4 w-4" /> Novo post</Button>
      </header>

      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-tk-brand">Acervo editorial</h2>
            <p className="text-sm text-tk-ink-muted" role="status">{filteredPosts.length} de {blogPosts.length} artigos</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
            <Input label="Buscar registros" placeholder="Título, autor ou categoria" value={search} onChange={(event) => setSearch(event.target.value)} />
            <label className="grid gap-2 text-sm font-medium text-tk-ink">
              Status
              <select className="h-11 rounded-tk-input border border-tk-line bg-tk-surface px-4 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as BlogStatus | "Todos")}>
                <option>Todos</option>
                {statuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
          </div>

          {filteredPosts.length ? (
            <div className="overflow-x-auto rounded-2xl border border-tk-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-tk-surface-2 text-tk-ink-muted">
                  <tr>
                    <th scope="col" className="px-5 py-4 font-semibold">Artigo</th>
                    <th scope="col" className="px-5 py-4 font-semibold">Status</th>
                    <th scope="col" className="hidden px-5 py-4 font-semibold lg:table-cell">Autor</th>
                    <th scope="col" className="px-5 py-4 text-right font-semibold">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tk-line">
                  {filteredPosts.map((post) => (
                    <tr key={post.id} className="transition-colors hover:bg-tk-surface-2">
                      <td className="min-w-[200px] px-5 py-5">
                        <Link href={`/admin/blog/${encodeURIComponent(post.id)}/editar`} className="font-semibold text-tk-brand hover:underline">{post.title || "Sem título"}</Link>
                        <p className="mt-1 text-xs text-tk-ink-muted">{post.category}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-5"><Badge variant={statusTone(post.status)}>{post.status}</Badge></td>
                      <td className="hidden px-5 py-5 text-tk-ink-muted lg:table-cell">{post.author}</td>
                      <td className="px-5 py-5 text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/admin/blog/${encodeURIComponent(post.id)}/editar`} aria-label={`Editar ${post.title || "artigo sem título"}`}>Editar <ArrowUpRight className="h-4 w-4" /></Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-tk-line px-6 py-14 text-center">
              {blogPosts.length ? <Search className="mx-auto h-8 w-8 text-tk-ink-muted" /> : <FileText className="mx-auto h-8 w-8 text-tk-ink-muted" />}
              <h3 className="mt-4 font-bold text-tk-brand">{blogPosts.length ? "Nenhum artigo encontrado" : "Seu primeiro artigo começa aqui"}</h3>
              <p className="mt-2 text-sm text-tk-ink-muted">{blogPosts.length ? "Tente outro termo ou ajuste o filtro de status." : "Crie um rascunho e prepare o conteúdo para publicação."}</p>
              {blogPosts.length ? (
                <Button variant="outline" className="mt-5" onClick={() => { setSearch(""); setStatusFilter("Todos"); }}>Limpar filtros</Button>
              ) : (
                <Button asChild className="mt-5"><Link href="/admin/blog/novo">Criar primeiro artigo</Link></Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
