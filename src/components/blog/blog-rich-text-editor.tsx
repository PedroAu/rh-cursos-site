"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { z } from "zod";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Undo2,
  Unlink
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { isSafeUrl } from "@/lib/security/sanitize";
import { cn } from "@/lib/utils";

type RichTextEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  disabled?: boolean;
};

type ToolbarButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

const linkUrlSchema = z.string()
  .trim()
  .min(1, "Informe uma URL.")
  .max(2048, "A URL deve ter no máximo 2048 caracteres.")
  .refine((value) => value.startsWith("/") || URL.canParse(value), "Informe uma URL válida.");

function ToolbarButton({ label, active, disabled = false, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg text-tk-ink-muted transition hover:bg-tk-surface hover:text-tk-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tk-focus disabled:cursor-not-allowed disabled:opacity-50",
        active && "bg-tk-accent-soft text-tk-accent-strong"
      )}
    >
      {children}
    </button>
  );
}

export function BlogRichTextEditor({ value, onChange, disabled = false }: RichTextEditorProps) {
  const lastValueRef = useRef(value);
  const isReadyRef = useRef(false);
  const [linkPanelOpen, setLinkPanelOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        // H1-H4 are retained when editing legacy posts. The toolbar intentionally
        // offers only H2/H3 because the post title already occupies the H1.
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
    content: value,
    contentType: "markdown",
    editable: !disabled,
    editorProps: {
      attributes: {
        id: "blog-content",
        role: "textbox",
        "aria-label": "Conteúdo",
        "aria-multiline": "true",
        class: "tiptap min-h-[360px] px-4 py-3 text-sm leading-7 text-tk-ink outline-none"
      }
    },
    onUpdate: ({ editor: currentEditor }) => {
      const markdown = currentEditor.getMarkdown();
      if (!isReadyRef.current) {
        lastValueRef.current = markdown;
        return;
      }
      if (markdown === lastValueRef.current) return;
      lastValueRef.current = markdown;
      onChange(markdown);
    }
  });

  useEffect(() => {
    if (!editor) return;
    lastValueRef.current = editor.getMarkdown();
    isReadyRef.current = true;
  }, [editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || value === lastValueRef.current) return;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    lastValueRef.current = value;
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  const openLinkPanel = () => {
    if (!editor) return;
    setLinkUrl(editor.getAttributes("link").href ?? "");
    setLinkError(null);
    setLinkPanelOpen(true);
  };

  const applyLink = () => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkPanelOpen(false);
      return;
    }
    const parsedUrl = linkUrlSchema.safeParse(url);
    if (!parsedUrl.success || !isSafeUrl(parsedUrl.data)) {
      setLinkError(parsedUrl.success ? "Use uma URL HTTP(S), mailto, tel ou um link interno iniciado por /." : parsedUrl.error.issues[0]?.message ?? "URL inválida.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: parsedUrl.data }).run();
    setLinkPanelOpen(false);
  };

  if (!editor) {
    return <div className="min-h-[360px] animate-pulse rounded-b-tk-input border border-tk-line bg-tk-surface-2" aria-label="Carregando editor" />;
  }

  return (
    <div className="overflow-hidden rounded-tk-input border border-tk-line bg-tk-surface focus-within:ring-2 focus-within:ring-tk-focus">
      <div className="flex flex-wrap items-center gap-1 border-b border-tk-line bg-tk-surface-2 p-2" aria-label="Formatação do conteúdo">
        <ToolbarButton label="Desfazer" disabled={!editor.can().undo() || disabled} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Refazer" disabled={!editor.can().redo() || disabled} onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 h-5 border-l border-tk-line" aria-hidden="true" />
        <ToolbarButton label="Negrito" active={editor.isActive("bold")} disabled={disabled} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Itálico" active={editor.isActive("italic")} disabled={disabled} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Subtítulo H2" active={editor.isActive("heading", { level: 2 })} disabled={disabled} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Subtítulo H3" active={editor.isActive("heading", { level: 3 })} disabled={disabled} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Lista com marcadores" active={editor.isActive("bulletList")} disabled={disabled} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Lista numerada" active={editor.isActive("orderedList")} disabled={disabled} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Citação" active={editor.isActive("blockquote")} disabled={disabled} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Link" active={editor.isActive("link")} disabled={disabled} onClick={openLinkPanel}><Link2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Separador" disabled={disabled} onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Limpar formatação" disabled={disabled} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting className="h-4 w-4" /></ToolbarButton>
      </div>

      {linkPanelOpen ? (
        <div className="flex flex-wrap items-end gap-2 border-b border-tk-line bg-tk-surface p-3">
          <div className="min-w-[16rem] flex-1"><Input label="URL do link" value={linkUrl} onChange={(event) => { setLinkUrl(event.target.value); setLinkError(null); }} placeholder="https:// ou /cursos/..." error={linkError ?? undefined} /></div>
          <button type="button" className="h-11 rounded-tk-button bg-tk-cta px-4 text-sm font-semibold text-white" onClick={applyLink}>Aplicar link</button>
          {editor.isActive("link") ? <ToolbarButton label="Remover link" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkPanelOpen(false); }}><Unlink className="h-4 w-4" /></ToolbarButton> : null}
        </div>
      ) : null}

      <EditorContent
        editor={editor}
        className="[&_a]:font-semibold [&_a]:text-tk-accent-strong [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:my-5 [&_blockquote]:border-l-4 [&_blockquote]:border-tk-accent [&_blockquote]:pl-5 [&_blockquote]:italic [&_blockquote]:text-tk-ink-muted [&_code]:rounded [&_code]:bg-tk-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_h1]:mb-3 [&_h1]:mt-8 [&_h1]:font-tk-display [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:font-tk-display [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mb-3 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-bold [&_h4]:mb-3 [&_h4]:mt-5 [&_h4]:text-lg [&_h4]:font-bold [&_hr]:my-6 [&_hr]:border-tk-line [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-0 [&_p+p]:mt-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6"
      />
      <p className="border-t border-tk-line bg-tk-surface-2 px-4 py-2 text-caption text-tk-ink-muted">A caixa mostra a aparência do artigo publicado. Atalhos: ⌘/Ctrl+B e ⌘/Ctrl+I.</p>
    </div>
  );
}
