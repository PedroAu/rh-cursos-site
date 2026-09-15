import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminBlogPage } from "@/features/admin/blog/admin-blog-page";
import { AdminBlogEditor, AdminBlogEditPage } from "@/features/admin/blog/admin-blog-editor";
import type { BlogPost } from "@/types";

const mocks = vi.hoisted(() => ({
  push: vi.fn(), saveBlogDraft: vi.fn(), saveBlogContent: vi.fn(),
  transitionBlogPost: vi.fn(), deleteBlogPost: vi.fn(), blogPosts: [] as BlogPost[]
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a>
}));
vi.mock("@/lib/contexts/admin-context", () => ({ useAdminStore: () => mocks }));
vi.mock("@/components/blog/blog-rich-text-editor", () => ({
  BlogRichTextEditor: ({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) => (
    <textarea aria-label="Conteúdo" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  )
}));

const post: BlogPost = {
  id: "post-1", title: "Rotinas de departamento pessoal", slug: "rotinas-dp",
  summary: "Resumo completo para um artigo de departamento pessoal.", content: "Conteúdo do artigo. ".repeat(12),
  category: "Departamento Pessoal", author: "Equipe RH Cursos", tags: [],
  date: "2026-09-14T12:00:00Z", readingTime: "5 min", status: "Rascunho", image: "", relatedCourseId: ""
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.blogPosts = [post, { ...post, id: "post-2", title: "Artigo publicado", status: "Publicado" }];
  mocks.saveBlogDraft.mockResolvedValue("post-1");
});
afterEach(() => vi.useRealTimers());

describe("Gestão do blog em páginas separadas", () => {
  it("mostra apenas o acervo com links próprios de criação e edição", () => {
    render(<AdminBlogPage />);
    expect(screen.getByRole("link", { name: "Novo artigo" })).toHaveAttribute("href", "/admin/blog/novo");
    expect(screen.getByRole("link", { name: `Editar ${post.title}` })).toHaveAttribute("href", "/admin/blog/post-1/editar");
    expect(screen.queryByLabelText("Conteúdo")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Publicado" } });
    expect(screen.queryByRole("link", { name: post.title })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Artigo publicado" })).toBeVisible();
  });

  it("abre o artigo sem exibir acervo nem salvá-lo automaticamente", async () => {
    vi.useFakeTimers();
    render(<AdminBlogEditPage postId={post.id} />);
    expect(screen.getByLabelText("Título")).toHaveValue(post.title);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(mocks.saveBlogDraft).not.toHaveBeenCalled();
  });

  it("salva as alterações antes de voltar ao acervo", async () => {
    let resolveSave!: (id: string) => void;
    mocks.saveBlogDraft.mockReturnValueOnce(new Promise<string>((resolve) => { resolveSave = resolve; }));
    render(<AdminBlogEditor initialPost={post} />);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Título revisado" } });
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao acervo" }));
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.saveBlogDraft).toHaveBeenCalledWith(expect.objectContaining({ id: post.id, title: "Título revisado" }), { silent: true });
    await act(async () => { resolveSave(post.id); });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/admin/blog"));
  });

  it("preserva a edição quando o salvamento falha ao sair", async () => {
    mocks.saveBlogDraft.mockRejectedValueOnce(new Error("Falha de conexão"));
    render(<AdminBlogEditor initialPost={post} />);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Título pendente" } });
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao acervo" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Falha de conexão"));
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Título")).toHaveValue("Título pendente");
  });

  it("retorna ao acervo sem criar um artigo vazio", () => {
    render(<AdminBlogEditor />);
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao acervo" }));
    expect(mocks.push).toHaveBeenCalledWith("/admin/blog");
    expect(mocks.saveBlogDraft).not.toHaveBeenCalled();
  });

  it("mostra retorno ao acervo quando o artigo não existe", () => {
    render(<AdminBlogEditPage postId="ausente" />);
    expect(screen.getByText("Artigo não encontrado")).toBeVisible();
    expect(screen.getByRole("link", { name: "Voltar ao acervo" })).toHaveAttribute("href", "/admin/blog");
    expect(screen.queryByLabelText("Título")).not.toBeInTheDocument();
  });

  it("usa o conteúdo visual salvo na mesma prévia da publicação", () => {
    render(<AdminBlogEditor initialPost={post} />);
    const content = screen.getByLabelText("Conteúdo") as HTMLTextAreaElement;
    fireEvent.change(content, { target: { value: "**Trecho importante**" } });

    fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));
    expect(screen.getByText("Trecho importante").tagName).toBe("STRONG");
  });
});
