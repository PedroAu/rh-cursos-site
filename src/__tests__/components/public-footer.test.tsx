import type { AnchorHTMLAttributes, ImgHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { render, screen, within } from "@/__tests__/utils";
import { PublicFooter } from "@/features/public-shell/components/public-footer";

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img alt="" {...props} />
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/"
}));

describe("PublicFooter", () => {
  it("expõe links acessíveis para os perfis oficiais", () => {
    render(<PublicFooter />);

    expect(screen.getByRole("link", { name: "RH Cursos & Soluções" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("img", { name: "RH Cursos & Soluções" })).toBeInTheDocument();

    const profiles = within(screen.getByRole("navigation", { name: "Perfis oficiais da RH Cursos & Soluções" }));
    const expectedLinks = [
      ["LinkedIn", "https://www.linkedin.com/company/rhcursoesolucoes"],
      ["Instagram", "https://www.instagram.com/rhcursos/"],
      ["Facebook", "https://www.facebook.com/rhcursostreinamento/"],
      ["YouTube", "https://www.youtube.com/@rhcursosetreinamentosempre580"]
    ] as const;

    expectedLinks.forEach(([name, href]) => {
      const link = profiles.getByRole("link", { name });

      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
    });
  });
});
