"use client";

import Image from "next/image";
import NextLink from "next/link";
import { usePathname } from "next/navigation";

import { company } from "@/lib/company";
import { cn } from "@/lib/utils";

const footerColumns = [
  {
    items: [
      { label: "Cursos abertos", to: "/cursos" },
      { label: "Agenda", to: "/agenda" },
      { label: "In-company", to: "/in-company" },
      { label: "Consultoria", to: "/consultoria" }
    ],
    title: "Ofertas"
  },
  {
    items: [
      { label: "Sobre", to: "/sobre" },
      { label: "Blog", to: "/blog" },
      { label: "Instrutores", to: "/sobre" },
      { label: "Contato", to: "/contato" }
    ],
    title: "Empresa"
  },
  {
    items: [
      { label: "Área do aluno", to: "/login" },
      { label: "Área do instrutor", to: "/login" },
      { label: "Entrar", to: "/login" }
    ],
    title: "Acesso"
  }
] as const;

const socialLinks = [
  { label: "LinkedIn", href: company.links.linkedin },
  { label: "Instagram", href: company.links.instagram },
  { label: "Facebook", href: company.links.facebook },
  { label: "YouTube", href: company.links.youtube }
] as const;

function isActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function PublicFooter() {
  const pathname = usePathname() ?? "/";
  const isAboutPage = pathname.startsWith("/sobre");

  return (
    <footer className="border-t border-tk-line bg-tk-surface-2 px-6 py-14 md:px-10 md:pb-10">
      <div className="mx-auto w-[min(var(--tk-container),calc(100%-24px))] md:w-[min(var(--tk-container),calc(100%-40px))]">
        <div className="grid gap-10 border-b border-tk-line pb-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <NextLink
              href="/"
              aria-label="RH Cursos & Soluções"
              className="inline-flex rounded-tk-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tk-focus focus-visible:ring-offset-2"
            >
              <Image
                src="/images/brand/logo-horizontal.png"
                alt="RH Cursos & Soluções"
                width={453}
                height={285}
                className="h-12 w-auto"
              />
            </NextLink>
            <p className="mt-5 max-w-[34ch] text-[16px] leading-[1.6] text-tk-ink-muted">
              {isAboutPage
                ? "Transformando vidas por meio do conhecimento desde 2007. Brasília – Distrito Federal · www.rhcursos.com.br"
                : "Cursos, treinamento in-company e consultoria para organizações públicas e privadas."}
            </p>
          </div>

          {footerColumns.map((column) => (
            <div key={column.title}>
              <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-tk-ink-muted">
                {column.title}
              </p>
              <div className="space-y-2.5">
                {column.items.map((item) => {
                  const active = isActive(pathname, item.to);

                  return (
                    <NextLink
                      key={item.to + item.label}
                      href={item.to}
                      className={cn(
                        "block text-[16px] leading-[1.55] text-tk-ink transition hover:text-tk-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tk-focus focus-visible:ring-offset-2",
                        active && "font-semibold text-tk-brand"
                      )}
                    >
                      {item.to === "/sobre" ? "Quem Somos" : item.label}
                    </NextLink>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <nav className="flex flex-wrap gap-x-5 gap-y-2 pt-6" aria-label="Perfis oficiais da RH Cursos & Soluções">
          {socialLinks.map((socialLink) => (
            <a
              key={socialLink.href}
              href={socialLink.href}
              target="_blank"
              rel="noreferrer"
              className="text-[14px] font-medium text-tk-ink transition hover:text-tk-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tk-focus focus-visible:ring-offset-2"
            >
              {socialLink.label}
            </a>
          ))}
        </nav>

        <p className="pt-6 text-[12px] leading-[1.4] text-tk-ink-muted">
          {isAboutPage
            ? "© 2026 RH Cursos & Soluções. Todos os direitos reservados."
            : "© 2026 RH Cursos. Todos os direitos reservados."}
        </p>
      </div>
    </footer>
  );
}
