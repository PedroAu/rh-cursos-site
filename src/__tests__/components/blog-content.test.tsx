import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BlogContent, blogContentToText } from "@/components/blog/blog-content";

describe("BlogContent", () => {
  it("renderiza a formatação editorial segura", () => {
    render(
      <BlogContent
        format="markdown"
        content={'# Título\n\n## Seção\n\n**ênfase** e *ênfase leve*\n\n- Primeiro\n- Segundo\n\n> Nota editorial\n\n[Curso](/cursos/esocial)'}
      />
    );

    expect(screen.getByRole("heading", { name: "Título" })).toHaveAttribute("class", expect.stringContaining("font-bold"));
    expect(screen.getByRole("heading", { name: "Seção" })).toBeVisible();
    expect(screen.getByText("ênfase").tagName).toBe("STRONG");
    expect(screen.getByRole("list")).toBeVisible();
    expect(screen.getByRole("link", { name: "Curso" })).toHaveAttribute("href", "/cursos/esocial");
  });

  it("não transforma URLs inseguras em links e preserva texto para leitura guiada", () => {
    render(<BlogContent format="markdown" content={'[link](javascript:alert(1))\n\n**texto**'} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(blogContentToText("## Seção\n\n- **texto**", "markdown")).toContain("Seção");
    expect(blogContentToText("## Seção\n\n- **texto**", "markdown")).toContain("texto");
  });
});
