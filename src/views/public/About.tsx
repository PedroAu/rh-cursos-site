"use client";

import { Check, Diamond, Gem, Scale, Section, SquareDashedMousePointer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppStore } from "@/lib/app-store";
import { company } from "@/lib/company";
import { Link } from "@/lib/router-compat";
import { cn } from "@/lib/utils";

const values = [
  "Ética e transparência em todas as relações.",
  "Responsabilidade, comprometimento e honestidade em cada treinamento.",
  "Busca constante por resultados, multiplicação da tecnologia e expansão do conhecimento.",
  "Estímulo à iniciativa, motivação, criatividade e comunicação."
];

const solutions = [
  {
    description:
      "Presenciais e online, com temas atualizados para as áreas pública e privada, focados em qualificação técnica e atualização profissional.",
    glyph: "§",
    tint: "linear-gradient(135deg,var(--tk-brand),color-mix(in_srgb,var(--tk-brand) 76%,var(--tk-accent)))",
    title: "Cursos abertos"
  },
  {
    description:
      "Programas personalizados conforme as necessidades de cada instituição, com adequação de horário, agenda e conteúdo e redução de custos para o cliente.",
    glyph: "◆",
    tint: "linear-gradient(135deg,var(--tk-accent),color-mix(in_srgb,var(--tk-accent) 72%,white))",
    title: "Treinamentos in company"
  },
  {
    description:
      "Apoio especializado a órgãos públicos e empresas na estruturação de processos, conformidade legal e desenvolvimento de pessoas.",
    glyph: "◈",
    tint: "linear-gradient(135deg,color-mix(in_srgb,var(--tk-brand) 60%,var(--tk-focus)),color-mix(in_srgb,var(--tk-focus) 78%,white))",
    title: "Consultoria empresarial"
  }
];

const trackDefinitions = [
  {
    audience: "Servidores do DP, RH, gestores de contratos e contadores da Administração Pública.",
    description: "Da legislação trabalhista à conformidade digital com eSocial, FGTS Digital e LGPD.",
    icon: Section,
    matchCategories: ["Departamento Pessoal", "eSocial"],
    tint: "linear-gradient(135deg,var(--tk-brand),color-mix(in_srgb,var(--tk-brand) 76%,var(--tk-accent)))",
    title: "Departamento Pessoal, Folha & eSocial"
  },
  {
    audience: "Pregoeiros, gestores e fiscais de contratos, equipes de licitação e procurement público.",
    description: "Da legislação básica à fiscalização avançada, com cobertura completa da Lei nº 14.133/2021.",
    icon: Scale,
    matchCategories: ["Licitações e Contratos", "Licitações"],
    tint: "linear-gradient(135deg,color-mix(in_srgb,var(--tk-brand) 72%,var(--tk-accent)),var(--tk-success))",
    title: "Licitações, Compras & Contratos"
  },
  {
    audience: "Gestores, líderes de equipe, servidores e profissionais de RH dos setores público e privado.",
    description: "Formação humanizada para líderes e equipes: inteligência emocional, cultura e gestão por resultados.",
    icon: Gem,
    matchCategories: ["Gestão de Pessoas", "Liderança"],
    tint: "linear-gradient(135deg,var(--tk-brand),color-mix(in_srgb,var(--tk-success) 58%,var(--tk-brand)))",
    title: "Gestão de Pessoas & Liderança"
  },
  {
    audience: "Servidores, ouvidores, assessores de comunicação, profissionais jurídicos e atendentes.",
    description: "Do atendimento ao cidadão à redação oficial, oratória, mídias digitais e conformidade com LAI/LGPD.",
    icon: SquareDashedMousePointer,
    matchCategories: ["Comunicação"],
    tint: "linear-gradient(135deg,color-mix(in_srgb,var(--tk-brand) 34%,var(--tk-cream-dark)),color-mix(in_srgb,var(--tk-cream-dark) 82%,white))",
    title: "Comunicação, Redação & Atendimento"
  },
  {
    audience: "Contadores, auditores, controllers, analistas financeiros e servidores das áreas de controle.",
    description: "Domínio técnico em contabilidade pública, obrigações acessórias, Tesouro Gerencial, SIAFI e auditoria.",
    icon: Diamond,
    matchCategories: ["Compliance", "Auditoria", "Contabilidade", "Tributos"],
    tint: "linear-gradient(135deg,var(--tk-accent),var(--tk-brand))",
    title: "Auditoria, Contabilidade & Tributos"
  },
  {
    audience: "Servidores, analistas de TI, gestores de processos e inovação, e todos que usam tecnologia no trabalho.",
    description: "Ferramentas digitais, análise de dados, modelagem de processos, IA e governança.",
    icon: Gem,
    matchCategories: ["Tecnologia"],
    tint: "linear-gradient(135deg,color-mix(in_srgb,var(--tk-brand) 60%,var(--tk-focus)),color-mix(in_srgb,var(--tk-focus) 78%,white))",
    title: "Tecnologia, Dados & Inovação"
  }
];

function SectionEyebrow({ children }: { children: string }) {
  return (
    <Badge tone="accent" className="w-fit px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">{children}</Badge>
  );
}

export function AboutPage() {
  const { courses, trainingPaths } = useAppStore();
  const institutionalStats = [
    { label: "Ano de fundação", value: String(company.foundedYear) },
    { label: "Cursos publicados", value: String(courses.length) },
    { label: "Trilhas de conhecimento", value: String(trainingPaths.length) },
    { label: "Alcance de atuação", value: "Nacional" }
  ];
  const countsByCategory = courses.reduce<Map<string, number>>((accumulator, course) => {
    const categories = [course.category, course.pathName, ...(course.categories ?? [])].filter(Boolean) as string[];

    categories.forEach((category) => {
      accumulator.set(category, (accumulator.get(category) ?? 0) + 1);
    });

    return accumulator;
  }, new Map<string, number>());

  const tracks = trackDefinitions.map((track) => {
    const derivedCount = track.matchCategories.reduce((total, category) => total + (countsByCategory.get(category) ?? 0), 0);

    return {
      ...track,
      count: `${derivedCount} cursos`
    };
  });

  return (
    <div className="bg-tk-surface text-tk-ink">
      <section className="border-b border-tk-line bg-[image:var(--tk-gradient-soft)]">
        <div className="mx-auto w-[min(var(--tk-container),calc(100%-24px))] py-14 md:w-[min(var(--tk-container),calc(100%-40px))] md:py-16">
          <Badge tone="accent" dot className="w-fit px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
            Documento institucional · Desde 2007
          </Badge>
          <h1 className="mt-5 max-w-[10ch] font-tk-display text-[2.75rem] font-bold leading-[1.03] tracking-[-0.03em] text-tk-ink md:text-[3rem]">
            Quem somos: capacitação e consultoria desde 2007
          </h1>
          <p className="mt-4 max-w-[62ch] font-tk-serif text-[1.14rem] font-normal leading-[1.45] text-tk-ink-muted">
            A RH Cursos &amp; Soluções é uma empresa brasileira de educação corporativa, consultoria e treinamento
            empresarial, fundada em 2007, com sede em Águas Claras, Brasília – DF, e atuação nacional na capacitação
            de servidores públicos e profissionais do setor privado. CNPJ: 08.703.044/0001-90.
          </p>
        </div>
      </section>

      <section className="border-b border-tk-line bg-tk-surface">
        <div className="mx-auto grid w-[min(var(--tk-container),calc(100%-24px))] md:w-[min(var(--tk-container),calc(100%-40px))] md:grid-cols-2 xl:grid-cols-4">
          {institutionalStats.map((item, index) => (
            <div
              key={item.label}
              className={cn(
                "px-5 py-8 md:border-b md:border-tk-line xl:border-b-0",
                index < institutionalStats.length - 1 && "xl:border-r xl:border-tk-line",
                index >= 2 && "md:border-b-0"
              )}
            >
              <p className="font-tk-display text-[var(--tk-text-display)] font-bold tracking-[-0.02em] text-tk-brand">{item.value}</p>
              <p className="mt-1 text-sm text-tk-ink-muted">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto grid w-[min(var(--tk-container),calc(100%-24px))] gap-12 md:w-[min(var(--tk-container),calc(100%-40px))] lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <SectionEyebrow>Nossa história</SectionEyebrow>
            <h2 className="mt-2 max-w-[12ch] font-tk-display text-[2rem] font-bold leading-[1.08] tracking-[-0.02em] text-tk-ink">
              Nascida do sonho de compartilhar conhecimento
            </h2>
          </div>
          <div className="space-y-5 text-[15px] leading-8 text-tk-ink-muted">
            <p>
              Fundada em 2007, a RH Cursos &amp; Soluções nasceu da união do casal <strong className="text-tk-ink">Ester e Nilson</strong>,
              que combinaram suas experiências em advocacia, consultoria e ensino para construir uma instituição voltada a transformar vidas por meio do conhecimento.
            </p>
            <p>
              Originalmente constituída no Distrito Federal e sediada em Taguatinga, a empresa estruturou-se para oferecer cursos abertos e treinamentos in company em todo o território nacional, consolidando um histórico robusto em temas técnicos de alta relevância para o setor público, como GFIP/SEFIP, SIAFI/CPR, escrituração fiscal digital, cálculos trabalhistas, fiscalização de contratos e legislação previdenciária.
            </p>
            <p>
              Hoje, a empresa organiza seu portfólio em trilhas de conhecimento, com progressão lógica do nível básico ao avançado dentro de cada área de especialização.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--rh-paper-line)] bg-[var(--rh-paper-a)] py-16">
        <div className="mx-auto w-[min(var(--tk-container),calc(100%-24px))] md:w-[min(var(--tk-container),calc(100%-40px))]">
          <SectionEyebrow>Propósito</SectionEyebrow>
          <h2 className="mt-2 font-tk-display text-[2rem] font-bold leading-[1.08] tracking-[-0.02em] text-tk-ink">
            Missão, visão e filosofia
          </h2>

          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {[
              {
                body: "Subsidiar, por meio do conhecimento, a formação do indivíduo para desempenhar suas funções no mercado de trabalho, de forma que as instituições potencializem seus negócios e maximizem seus resultados.",
                title: "Missão"
              },
              {
                body: "Buscar a excelência para ser a melhor empresa de cursos e treinamentos no circuito nacional.",
                title: "Visão"
              },
              {
                body: "Ética, transparência e metodologias participativas, aulas expositivas, dinâmicas de grupo e trabalho em equipe, com aplicação de conhecimento técnico-científico.",
                title: "Filosofia"
              }
            ].map((item) => (
              <Card
                key={item.title}
                className="rounded-tk-card border-tk-line bg-tk-surface"
              >
                <CardContent className="p-8">
                  <h3 className="font-tk-display text-[1.5rem] font-bold tracking-[-0.02em] text-tk-brand">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-tk-ink-muted">{item.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-10">
            <SectionEyebrow>Valores que nos orientam</SectionEyebrow>
            <div className="mt-4 grid gap-x-10 gap-y-4 md:grid-cols-2">
              {values.map((item) => (
                <div key={item} className="flex gap-3 text-sm leading-6 text-tk-ink-muted">
                  <div className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-tk-accent-soft text-tk-accent-strong">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto w-[min(var(--tk-container),calc(100%-24px))] md:w-[min(var(--tk-container),calc(100%-40px))]">
          <SectionEyebrow>O que fazemos</SectionEyebrow>
          <h2 className="mt-2 font-tk-display text-[2rem] font-bold leading-[1.08] tracking-[-0.02em] text-tk-ink">
            Soluções educacionais integradas
          </h2>
          <p className="mt-3 max-w-[60ch] text-[15px] leading-8 text-tk-ink-muted">
            Um conjunto de soluções educacionais e de consultoria adaptadas à realidade de cada cliente.
          </p>

          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {solutions.map((item) => {
              return (
                <Card
                  key={item.title}
                  className="rounded-tk-card border-tk-line bg-tk-surface"
                >
                  <CardContent className="p-8">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-tk-field-lg text-white"
                      style={{ background: item.tint }}
                    >
                      <span aria-hidden="true" className="font-tk-display text-[20px] font-bold leading-none">
                        {item.glyph}
                      </span>
                    </div>
                    <h3 className="mt-4 font-tk-display text-[1.5rem] font-bold tracking-[-0.02em] text-tk-ink">{item.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-tk-ink-muted">{item.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-tk-line bg-tk-surface-2 py-16">
        <div className="mx-auto w-[min(var(--tk-container),calc(100%-24px))] md:w-[min(var(--tk-container),calc(100%-40px))]">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <SectionEyebrow>Áreas de conhecimento</SectionEyebrow>
              <h2 className="mt-2 font-tk-display text-[2rem] font-bold leading-[1.08] tracking-[-0.02em] text-tk-ink">
                {trainingPaths.length} trilhas, {courses.length} cursos publicados
              </h2>
            </div>
            <p className="max-w-[38ch] text-sm leading-7 text-tk-ink-muted">
              Cada trilha oferece progressão lógica do básico ao avançado, agrupando cursos correlacionados por especialização.
            </p>
          </div>

          <div className="mt-8 grid gap-5 xl:grid-cols-2">
            {tracks.map((track) => {
              const Icon = track.icon;

              return (
                <Card
                  key={track.title}
                  className="rounded-tk-card border-tk-line bg-tk-surface"
                >
                  <CardContent className="flex gap-5 p-7">
                    <div
                      className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-tk-card-compact text-white"
                      style={{ background: track.tint }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <h3 className="font-tk-display text-base font-bold tracking-[-0.01em] text-tk-ink">{track.title}</h3>
                        <span className="text-[11px] font-semibold text-tk-accent-strong">{track.count}</span>
                      </div>
                      <p className="mt-2 text-sm leading-7 text-tk-ink-muted">{track.description}</p>
                      <p className="mt-2 text-xs leading-6 text-tk-ink-muted">
                        <strong className="text-tk-ink">Público:</strong> {track.audience}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto grid w-[min(var(--tk-container),calc(100%-24px))] gap-12 md:w-[min(var(--tk-container),calc(100%-40px))] lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <SectionEyebrow>Metodologia</SectionEyebrow>
            <h2 className="mt-2 max-w-[10ch] font-tk-display text-[2rem] font-bold leading-[1.08] tracking-[-0.02em] text-tk-ink">
              Aprender fazendo, aplicar no mesmo dia
            </h2>
          </div>
          <div className="space-y-5 text-[15px] leading-8 text-tk-ink-muted">
            <p>
              Adotamos uma abordagem participativa e prática, valorizando a aplicação imediata do conhecimento. As capacitações combinam aulas expositivas, dinâmicas de grupo, trabalho em equipe e exercícios práticos, muitas vezes com uso de computador para temas que envolvem sistemas e ferramentas digitais como SIAFI, Tesouro Gerencial, eSocial, Excel e Power BI.
            </p>
            <p>
              Os cursos são oferecidos nas modalidades presencial e online, com turmas em diferentes horários. Cada curso é estruturado por nível, básico, intermediário ou avançado, para que o participante avance de forma consistente dentro de sua trilha de interesse.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-tk-brand py-16 text-center text-tk-surface">
        <div className="mx-auto w-[min(var(--tk-container),calc(100%-24px))] md:w-[min(var(--tk-container),calc(100%-40px))]">
          <h2 className="mt-3 font-tk-display text-[var(--tk-text-display)] font-bold tracking-[-0.03em]">Pronto para capacitar sua equipe?</h2>
          <p className="mx-auto mt-4 max-w-[52ch] font-tk-serif text-[1.14rem] font-normal leading-[1.5] text-white/82">
            Fale com um especialista sobre cursos abertos, treinamentos in company e consultoria para o setor público e privado.
          </p>
          <div className="mt-8">
            <Button asChild variant="secondary" size="lg" className="bg-white text-tk-brand hover:bg-white/90">
              <Link to="/falar-com-especialista">Fale com um especialista →</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
