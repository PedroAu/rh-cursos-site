import type { ReactNode } from "react";
import Image from "next/image";

import { isSafeUrl } from "@/lib/security/sanitize";
import { cn } from "@/lib/utils";

export type BlogContentFormat = "plain" | "markdown";

type InlineNode = {
  value: string;
  kind: "text" | "strong" | "emphasis" | "code" | "link" | "image";
  url?: string;
};

function parseInline(value: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const pattern = /(!?\[([^\]]+)\]\(([^)\s]+)(?:\s+["']([^"']+)["'])?\)|\*\*([^*]+)\*\*|__([^_]+)__|(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)|`([^`]+)`)/g;
  let lastIndex = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push({ value: value.slice(lastIndex, index), kind: "text" });

    const token = match[0];
    if (token.startsWith("![")) {
      nodes.push({ value: match[2] ?? "Imagem", kind: "image", url: match[3] });
    } else if (token.startsWith("[")) {
      nodes.push({ value: match[2] ?? "Link", kind: "link", url: match[3] });
    } else if (match[5] || match[6]) {
      nodes.push({ value: match[5] ?? match[6] ?? "", kind: "strong" });
    } else if (match[7] || match[8]) {
      nodes.push({ value: match[7] ?? match[8] ?? "", kind: "emphasis" });
    } else if (match[9]) {
      nodes.push({ value: match[9], kind: "code" });
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < value.length) nodes.push({ value: value.slice(lastIndex), kind: "text" });
  return nodes;
}

function renderInline(value: string, keyPrefix: string): ReactNode[] {
  return parseInline(value).map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.kind === "strong") return <strong key={key}>{node.value}</strong>;
    if (node.kind === "emphasis") return <em key={key}>{node.value}</em>;
    if (node.kind === "code") return <code key={key} className="rounded bg-tk-surface-2 px-1.5 py-0.5 text-[0.9em]">{node.value}</code>;
    if (node.kind === "link" && node.url && isSafeUrl(node.url)) {
      return <a key={key} href={node.url} className="font-semibold text-tk-accent-strong underline underline-offset-4">{node.value}</a>;
    }
    if (node.kind === "image" && node.url && isSafeUrl(node.url)) {
      return (
        <Image
          key={key}
          src={node.url}
          alt={node.value}
          width={1200}
          height={630}
          className="my-5 max-h-[30rem] w-full rounded-2xl object-cover"
          unoptimized
        />
      );
    }
    return <span key={key}>{node.value}</span>;
  });
}

function renderPlainText(value: string) {
  return value.split(/\n\n+/).filter((block) => block.trim()).map((block, index) => (
    <p key={`plain-${index}`} className="whitespace-pre-line">{block}</p>
  ));
}

function renderMarkdown(value: string) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").trim();
    if (text) blocks.push(<p key={`paragraph-${blocks.length}`}>{renderInline(text, `paragraph-${blocks.length}`)}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const ListTag = list.ordered ? "ol" : "ul";
    blocks.push(
      <ListTag key={`list-${blocks.length}`} className="space-y-2 pl-6">
        {list.items.map((item, index) => <li key={`item-${index}`}>{renderInline(item, `list-${blocks.length}-${index}`)}</li>)}
      </ListTag>
    );
    list = null;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    blocks.push(
      <blockquote key={`quote-${blocks.length}`} className="border-l-4 border-tk-accent pl-5 italic text-tk-ink-muted">
        {quote.map((item, index) => <p key={`quote-line-${index}`}>{renderInline(item, `quote-${blocks.length}-${index}`)}</p>)}
      </blockquote>
    );
    quote = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      flushQuote();
      return;
    }
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph(); flushList(); flushQuote();
      const Heading = heading[1].length <= 2 ? "h2" : heading[1].length === 3 ? "h3" : "h4";
      blocks.push(<Heading key={`heading-${blocks.length}`} className="font-tk-display font-bold text-tk-ink">{renderInline(heading[2], `heading-${blocks.length}`)}</Heading>);
      return;
    }
    if (/^(---+|\*\*\*+|___+)$/.test(trimmed)) {
      flushParagraph(); flushList(); flushQuote();
      blocks.push(<hr key={`rule-${blocks.length}`} className="border-tk-line" />);
      return;
    }
    const quoteLine = trimmed.match(/^>\s?(.*)$/);
    if (quoteLine) {
      flushParagraph(); flushList();
      quote.push(quoteLine[1]);
      return;
    }
    const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+[.]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph(); flushQuote();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push((ordered ?? unordered)?.[1] ?? "");
      return;
    }
    flushList(); flushQuote();
    paragraph.push(trimmed);
  });

  flushParagraph(); flushList(); flushQuote();
  return blocks;
}

export function blogContentToText(value: string, format: BlogContentFormat = "plain") {
  if (format === "plain") return value;
  return value
    .replace(/!?(\[([^\]]+)\])\([^)]*\)/g, "$2")
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.]\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^(---+|\*\*\*+|___+)$/gm, "")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`/g, "$1$2$3$4$5");
}

export function BlogContent({ content, format = "plain", className }: { content: string; format?: BlogContentFormat; className?: string }) {
  return <div className={cn("space-y-5", className)}>{format === "markdown" ? renderMarkdown(content) : renderPlainText(content)}</div>;
}
