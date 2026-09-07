import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, waitFor } from "@/__tests__/utils";
import { ContactPage } from "@/views/public/Contact";

const mocks = vi.hoisted(() => ({
  createLead: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  trackEvent: vi.fn()
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError
  }
}));

vi.mock("@/lib/app-store", () => ({
  useAppStore: () => ({
    createLead: mocks.createLead
  })
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: mocks.trackEvent
}));

describe("ContactPage", () => {
  beforeEach(() => {
    mocks.createLead.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.trackEvent.mockReset();
  });

  it("oferece o telefone principal como link tel para conversão direta", () => {
    render(<ContactPage />);

    expect(screen.getByRole("link", { name: "(61) 3965-1929" })).toHaveAttribute(
      "href",
      "tel:+556139651929"
    );
  });

  it("exibe mensagens de validação quando o formulário está inválido", async () => {
    const user = userEvent.setup();

    render(<ContactPage />);

    await user.click(screen.getByRole("button", { name: /enviar mensagem/i }));

    expect(await screen.findByText("Nome deve ter no mínimo 3 caracteres.")).toBeInTheDocument();
    expect(screen.getByText("Informe um e-mail válido.")).toBeInTheDocument();
    expect(screen.getByText("Mensagem deve ter no mínimo 10 caracteres.")).toBeInTheDocument();
    expect(mocks.createLead).not.toHaveBeenCalled();
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it("envia o lead com os valores esperados e limpa o formulário", async () => {
    const user = userEvent.setup();
    mocks.createLead.mockResolvedValue(undefined);

    render(<ContactPage />);

    await user.type(screen.getByLabelText(/nome completo/i), "Maria Oliveira");
    await user.type(screen.getByLabelText(/e-mail/i), "maria@empresa.com.br");
    await user.type(screen.getByLabelText(/telefone \/ whatsapp/i), "61999998888");
    await user.type(screen.getByLabelText(/empresa \/ órgão/i), "Prefeitura X");
    await user.type(screen.getByLabelText(/mensagem/i), "Precisamos de apoio com treinamento em eSocial.");

    await user.click(screen.getByRole("button", { name: /enviar mensagem/i }));

    await waitFor(() => {
      expect(mocks.createLead).toHaveBeenCalledWith({
        name: "Maria Oliveira",
        email: "maria@empresa.com.br",
        phone: "(61) 99999-8888",
        type: "Contato",
        courseInterest: "Contato pelo site",
        organization: "Prefeitura X",
        origin: "Contato",
        message: "Precisamos de apoio com treinamento em eSocial."
      });
    });

    expect(await screen.findByText(/mensagem registrada\. nossa equipe retorna/i)).toBeInTheDocument();
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Mensagem registrada para atendimento.");
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.trackEvent).toHaveBeenCalledWith("lead_enviado", { origin: "formulario_contato" });
    expect(screen.getByLabelText(/nome completo/i)).toHaveValue("");
    expect(screen.getByLabelText(/e-mail/i)).toHaveValue("");
  });

  it("preserva os valores e mostra um único erro quando o lead não é persistido", async () => {
    const user = userEvent.setup();
    mocks.createLead.mockRejectedValueOnce(new Error("Serviço indisponível para contato."));

    render(<ContactPage />);

    await user.type(screen.getByLabelText(/nome completo/i), "Maria Oliveira");
    await user.type(screen.getByLabelText(/e-mail/i), "maria@empresa.com.br");
    await user.type(screen.getByLabelText(/telefone \/ whatsapp/i), "61999998888");
    await user.type(screen.getByLabelText(/empresa \/ órgão/i), "Prefeitura X");
    await user.type(screen.getByLabelText(/mensagem/i), "Precisamos de apoio com treinamento em eSocial.");

    await user.click(screen.getByRole("button", { name: /enviar mensagem/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Serviço indisponível para contato.");
    expect(screen.queryByText(/mensagem registrada\. nossa equipe retorna/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/nome completo/i)).toHaveValue("Maria Oliveira");
    expect(screen.getByLabelText(/e-mail/i)).toHaveValue("maria@empresa.com.br");
    expect(screen.getByLabelText(/telefone \/ whatsapp/i)).toHaveValue("(61) 99999-8888");
    expect(screen.getByLabelText(/empresa \/ órgão/i)).toHaveValue("Prefeitura X");
    expect(screen.getByLabelText(/mensagem/i)).toHaveValue(
      "Precisamos de apoio com treinamento em eSocial."
    );
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledWith("Serviço indisponível para contato.");
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it("rastreia canais diretos sem incluir dados pessoais", async () => {
    const user = userEvent.setup();

    render(<ContactPage />);

    await user.click(screen.getByRole("link", { name: "(61) 3965-1929" }));
    await user.click(screen.getByRole("link", { name: "WhatsApp" }));
    await user.click(screen.getByRole("link", { name: "E-mail" }));

    expect(mocks.trackEvent).toHaveBeenNthCalledWith(1, "canal_contato", {
      channel: "telefone",
      origin: "pagina_contato"
    });
    expect(mocks.trackEvent).toHaveBeenNthCalledWith(2, "canal_contato", {
      channel: "whatsapp",
      origin: "pagina_contato"
    });
    expect(mocks.trackEvent).toHaveBeenNthCalledWith(3, "canal_contato", {
      channel: "email",
      origin: "pagina_contato"
    });
  });
});
