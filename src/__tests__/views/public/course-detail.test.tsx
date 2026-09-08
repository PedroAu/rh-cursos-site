import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, waitFor } from "@/__tests__/utils";
import { CourseDetailPage } from "@/views/public/CourseDetail";

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams("checkout=1"),
  setSearchParams: vi.fn(),
  navigate: vi.fn(),
  trackEvent: vi.fn(),
  toastMessage: vi.fn()
}));

const mockStore = {
  courses: [
    {
      id: "course-1",
      slug: "curso-teste",
      title: "Curso Teste",
      pathId: "path-1",
      pathName: "Departamento Pessoal",
      modality: "Ao vivo online",
      durationLabel: "16h",
      durationHours: 16,
      level: "Básico",
      fullDescription: "Descricao completa do curso teste.",
      shortDescription: "Resumo",
      targetAudience: ["Analistas", "Gestores"],
      rating: 4.8,
      studentsCount: 120,
      benefits: ["Beneficio 1", "Beneficio 2", "Beneficio 3"],
      objectives: ["Objetivo 1", "Objetivo 2"],
      modules: [
        {
          title: "Modulo 1",
          description: "Descricao do modulo 1",
          topics: ["Topico A", "Topico B"],
          duration: "8h"
        }
      ],
      price: 1290,
      image: "/images/hero-rh-cursos.jpg",
      instructorId: "inst-1",
      status: "Ativo",
      featured: false,
      nextClassId: "class-1"
    }
  ],
  classes: [
    {
      id: "class-1",
      courseId: "course-1",
      startDate: "2026-08-12",
      endDate: "2026-08-13",
      time: "19:00 às 22:00",
      location: "Online ao vivo",
      modality: "Ao vivo online",
      status: "Inscrições abertas",
      totalSeats: 20,
      filledSeats: 10,
      availableSeats: 10,
      instructorId: "inst-1",
      price: 1290,
      notes: ""
    }
  ],
  instructors: [
    {
      id: "inst-1",
      name: "Instrutor Teste",
      email: "instrutor@empresa.com",
      phone: "61999990000",
      specialty: "Departamento Pessoal",
      bio: "Especialista em rotinas trabalhistas.",
      courseIds: ["course-1"],
      rating: 4.9,
      avatar: "IT",
      status: "Ativo"
    }
  ],
  coursePublicContents: [],
  testimonials: [],
  createEnrollment: vi.fn()
};

vi.mock("@/lib/router-compat", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
  useLocation: () => ({ pathname: "/cursos/curso-teste", search: "?checkout=1", state: null }),
  useNavigate: () => mocks.navigate,
  useParams: () => ({ slug: "curso-teste" }),
  useSearchParams: () => [mocks.params, mocks.setSearchParams]
}));

vi.mock("sonner", () => ({
  toast: {
    message: mocks.toastMessage
  }
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: () => ({ children, ...props }: { children?: React.ReactNode }) => <div {...props}>{children}</div>
    }
  ),
  useReducedMotion: () => true
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: mocks.trackEvent
}));

vi.mock("@/lib/app-store", () => ({
  useAppStore: () => mockStore
}));

vi.mock("@/components/agenda/class-card", () => ({
  ClassCard: ({ course }: { course: { title: string } }) => <div>Turma de {course.title}</div>
}));

vi.mock("@/components/common/testimonial-card", () => ({
  TestimonialCard: () => <div>Depoimento</div>
}));

describe("CourseDetailPage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    mockStore.classes = [
      {
        id: "class-1",
        courseId: "course-1",
        startDate: "2026-08-12",
        endDate: "2026-08-13",
        time: "19:00 às 22:00",
        location: "Online ao vivo",
        modality: "Ao vivo online",
        status: "Inscrições abertas",
        totalSeats: 20,
        filledSeats: 10,
        availableSeats: 10,
        instructorId: "inst-1",
        price: 1290,
        notes: ""
      }
    ];
    mocks.params = new URLSearchParams("checkout=1");
    mocks.setSearchParams.mockReset();
    mocks.setSearchParams.mockImplementation((next: URLSearchParams | Record<string, string>) => {
      mocks.params = next instanceof URLSearchParams ? next : new URLSearchParams(next);
    });
    mocks.navigate.mockReset();
    mocks.trackEvent.mockReset();
    mocks.toastMessage.mockReset();
  });

  it("redireciona o deeplink legado ?checkout=1 para a rota dedicada de checkout", async () => {
    render(<CourseDetailPage />);

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith("/cursos/curso-teste/checkout?classId=class-1", {
        replace: true,
      });
    });
  });

  it("envia o usuario para a rota dedicada ao clicar no CTA de inscrição", async () => {
    const user = userEvent.setup();
    mocks.params = new URLSearchParams("");

    render(<CourseDetailPage />);

    await user.click(screen.getByRole("button", { name: /enviar pré-inscrição/i }));

    expect(mocks.navigate).toHaveBeenCalledWith("/cursos/curso-teste/checkout?classId=class-1");
  });

  it("classifica a solicitação do programa PDF como CTA, não como lead persistido", async () => {
    const user = userEvent.setup();
    mocks.params = new URLSearchParams("");
    const assignSpy = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);

    render(<CourseDetailPage />);

    await user.click(screen.getByRole("button", { name: /programa pdf/i }));

    expect(mocks.trackEvent).toHaveBeenCalledWith("inscricao_cta", {
      course: "curso-teste",
      origin: "program_pdf_request"
    });
    expect(mocks.trackEvent).not.toHaveBeenCalledWith("lead_enviado", expect.anything());
    expect(assignSpy).toHaveBeenCalledWith("/falar-com-especialista");

    assignSpy.mockRestore();
  });

  it("exibe o contador persistido de alunos como prova social", () => {
    mocks.params = new URLSearchParams("");

    render(<CourseDetailPage />);

    expect(screen.getByText("120 alunos")).toBeInTheDocument();
  });

  it("mantém a data civil da turma sem recuar um dia por causa do fuso", () => {
    vi.stubEnv("TZ", "America/Sao_Paulo");
    mocks.params = new URLSearchParams("");

    render(<CourseDetailPage />);

    expect(screen.getByText("12–13 Ago 2026")).toBeInTheDocument();
  });

  it("mostra CTA de interesse quando não há turma aberta", async () => {
    mockStore.classes = [];
    mocks.params = new URLSearchParams("");

    render(<CourseDetailPage />);

    expect(screen.getByText("Sem turma aberta")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manifestar interesse/i })).toHaveAttribute(
      "href",
      "/falar-com-especialista"
    );
  });

  it("exibe turma esgotada sem oferecer pré-inscrição", () => {
    mockStore.classes = [{ ...mockStore.classes[0], availableSeats: 0, filledSeats: 20, totalSeats: 20 }];
    mocks.params = new URLSearchParams("");

    render(<CourseDetailPage />);

    expect(screen.getAllByText("Esgotada")).not.toHaveLength(0);
    expect(screen.getByText("Turma esgotada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enviar pré-inscrição/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manifestar interesse/i })).toHaveAttribute("href", "/falar-com-especialista");
  });

  it("mostra uma turma em breve e direciona para manifestação de interesse", () => {
    mockStore.classes = [{ ...mockStore.classes[0], status: "Em breve" }];
    mocks.params = new URLSearchParams("");

    render(<CourseDetailPage />);

    expect(screen.getAllByText("Turma nova")).not.toHaveLength(0);
    expect(screen.getByRole("link", { name: /manifestar interesse/i })).toBeInTheDocument();
  });

  it("mostra o nível do curso e não exibe rating público", () => {
    mocks.params = new URLSearchParams("");

    render(<CourseDetailPage />);

    expect(screen.getByText("Nível Básico")).toBeInTheDocument();
    expect(screen.queryByText(/Avaliação média/i)).not.toBeInTheDocument();
  });

  describe("prova social sem dado fabricado [Épica 17 · Story 17.2]", () => {
    const originalCourse = mockStore.courses[0];
    const originalTestimonials = mockStore.testimonials;

    beforeEach(() => {
      mocks.params = new URLSearchParams("");
    });

    afterEach(() => {
      mockStore.courses = [originalCourse];
      mockStore.testimonials = originalTestimonials;
    });

    it("não exibe depoimento fabricado quando não há override nem avaliação real vinculada ao curso", () => {
      mockStore.testimonials = [];

      render(<CourseDetailPage />);

      expect(screen.queryByText("Mariana Ferreira")).not.toBeInTheDocument();
      expect(screen.queryByText("Prefeitura de Campinas")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /depoimento/i })).not.toBeInTheDocument();
    });

    it("oculta os chips de avaliação e de alunos quando o curso não tem métrica real", () => {
      mockStore.courses = [{ ...originalCourse, rating: 0, studentsCount: 0 }];

      render(<CourseDetailPage />);

      expect(screen.queryByText(/Avaliação média/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/^\d+ alunos$/i)).not.toBeInTheDocument();
      expect(screen.getByText("1 turmas abertas")).toBeInTheDocument();
    });

    it("descreve o chip de turmas como 'turmas abertas', nunca 'turmas ministradas'", () => {
      render(<CourseDetailPage />);

      expect(screen.queryByText(/turmas ministradas/i)).not.toBeInTheDocument();
      expect(screen.getByText("1 turmas abertas")).toBeInTheDocument();
    });
  });

  it("nunca cruza benefits[i] com objectives[i] de comprimento diferente nos destaques [higiene]", () => {
    // Fixture já tem 3 benefits e apenas 2 objectives (comprimentos diferentes de propósito).
    mocks.params = new URLSearchParams("");

    render(<CourseDetailPage />);

    expect(screen.getByText("Beneficio 1")).toBeInTheDocument();
    expect(screen.getByText("Beneficio 3")).toBeInTheDocument();
    // A descrição nunca deve ser um objetivo de índice descasado — usa o resumo do curso.
    expect(screen.queryByText("Objetivo 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Objetivo 2")).not.toBeInTheDocument();
  });
});
