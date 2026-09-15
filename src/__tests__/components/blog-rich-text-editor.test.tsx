import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BlogRichTextEditor } from "@/components/blog/blog-rich-text-editor";
import { isSafeUrl } from "@/lib/security/sanitize";

function createMarkdownEditor(content = "Texto") {
  return new Editor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: {
          autolink: false,
          openOnClick: false,
          linkOnPaste: true,
          defaultProtocol: "https",
          protocols: ["mailto", { scheme: "tel", optionalSlashes: true }],
          isAllowedUri: (url, context) => isSafeUrl(url) && (url.startsWith("/") || context.defaultValidate(url))
        }
      }),
      Markdown.configure({ markedOptions: { gfm: false, breaks: false } })
    ],
    content,
    contentType: "markdown"
  });
}

describe("BlogRichTextEditor", () => {
  afterEach(() => vi.restoreAllMocks());

  it("mostra o Markdown já existente com semântica visual", async () => {
    render(<BlogRichTextEditor value={"## Subtítulo\n\nTexto **importante**"} onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Conteúdo" })).toBeVisible());
    const editor = screen.getByRole("textbox", { name: "Conteúdo" });
    expect(editor.innerHTML).toContain("<h2>Subtítulo</h2>");
    expect(editor.innerHTML).toContain("<strong>importante</strong>");
  });

  it("expõe todos os controles editoriais com rótulos acessíveis", async () => {
    render(<BlogRichTextEditor value="Texto" onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Conteúdo" })).toBeVisible());
    for (const label of [
      "Desfazer", "Refazer", "Negrito", "Itálico", "Subtítulo H2", "Subtítulo H3",
      "Lista com marcadores", "Lista numerada", "Citação", "Link", "Separador", "Limpar formatação"
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeVisible();
    }
  });

  it.each([
    ["negrito", (editor: Editor) => editor.chain().selectAll().toggleBold().run(), "**Texto**"],
    ["itálico", (editor: Editor) => editor.chain().selectAll().toggleItalic().run(), "*Texto*"],
    ["subtítulo H2", (editor: Editor) => editor.chain().selectAll().toggleHeading({ level: 2 }).run(), "## Texto"],
    ["subtítulo H3", (editor: Editor) => editor.chain().selectAll().toggleHeading({ level: 3 }).run(), "### Texto"],
    ["lista com marcadores", (editor: Editor) => editor.chain().selectAll().toggleBulletList().run(), "- Texto"],
    ["lista numerada", (editor: Editor) => editor.chain().selectAll().toggleOrderedList().run(), "1. Texto"],
    ["citação", (editor: Editor) => editor.chain().selectAll().toggleBlockquote().run(), "> Texto"]
  ])("serializa %s para Markdown", (_label, command, expectedMarkdown) => {
    const editor = createMarkdownEditor();
    command(editor);
    expect(editor.getMarkdown().trim()).toBe(expectedMarkdown);
    editor.destroy();
  });

  it("insere separador, remove formatação e mantém histórico", () => {
    const editor = createMarkdownEditor();
    editor.chain().focus().setHorizontalRule().run();
    expect(editor.getMarkdown()).toContain("---");

    editor.commands.setContent("**Texto**", { contentType: "markdown", emitUpdate: false });
    editor.chain().selectAll().unsetAllMarks().clearNodes().run();
    expect(editor.getMarkdown()).toBe("Texto");

    editor.chain().selectAll().toggleBold().run();
    editor.commands.undo();
    expect(editor.getMarkdown()).toBe("Texto");
    editor.commands.redo();
    expect(editor.getMarkdown()).toBe("**Texto**");
    editor.destroy();
  });

  it("aceita links permitidos e rejeita javascript", () => {
    const editor = createMarkdownEditor();
    editor.chain().selectAll().setLink({ href: "https://rhcursos.com.br" }).run();
    expect(editor.getMarkdown()).toBe("[Texto](https://rhcursos.com.br)");
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    editor.destroy();
  });

  it("exercita a toolbar visual, serializa alterações e sincroniza valor externo", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<BlogRichTextEditor value="Texto" onChange={onChange} />);
    const editor = await screen.findByRole("textbox", { name: "Conteúdo" });

    await user.click(editor);
    await user.keyboard("{Control>}a{/Control}");
    await user.click(screen.getByRole("button", { name: "Negrito" }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("**Texto**"));

    rerender(<BlogRichTextEditor value="## Atualizado" onChange={onChange} />);
    await waitFor(() => expect(editor.innerHTML).toContain("<h2>Atualizado</h2>"));
  });

  it("mostra feedback para URLs inválidas e aceita links seguros", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<BlogRichTextEditor value="Texto" onChange={onChange} />);
    const editor = await screen.findByRole("textbox", { name: "Conteúdo" });
    await user.click(editor);
    await user.keyboard("{Control>}a{/Control}");
    await user.click(screen.getByRole("button", { name: "Link" }));
    const input = screen.getByLabelText("URL do link");
    await user.type(input, "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Aplicar link" }));
    expect(screen.getByText(/URL válida|Use uma URL/)).toBeVisible();

    fireEvent.change(input, { target: { value: "https://rhcursos.com.br" } });
    await user.click(screen.getByRole("button", { name: "Aplicar link" }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("[Texto](https://rhcursos.com.br)"));
  });

  it("bloqueia a interação quando desabilitado", async () => {
    const onChange = vi.fn();
    render(<BlogRichTextEditor value="Texto" onChange={onChange} disabled />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Conteúdo" })).toBeVisible());
    expect(screen.getByRole("button", { name: "Negrito" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Link" })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
