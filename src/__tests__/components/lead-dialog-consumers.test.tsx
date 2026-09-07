import type { ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, render, screen, waitFor } from "@/__tests__/utils";
import {
  QuoteModalProvider,
  useQuoteModal,
} from "@/components/in-company/quote-modal";
import { WhatsAppSupport } from "@/features/public-shell/components/whatsapp-support";

const mocks = vi.hoisted(() => ({
  createLead: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock("@/lib/app-store", () => ({
  useAppStore: () => ({ createLead: mocks.createLead }),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: mocks.trackEvent,
}));

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");

  function Select({
    children,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
    value?: string;
  }) {
    const childArray = React.Children.toArray(children);
    const trigger = childArray.find(
      (child) => React.isValidElement(child) && Boolean((child.props as { id?: string }).id)
    );
    const triggerProps = React.isValidElement(trigger)
      ? (trigger.props as { id?: string; "aria-labelledby"?: string })
      : {};

    return React.createElement(
      "select",
      {
        id: triggerProps.id,
        "aria-labelledby": triggerProps["aria-labelledby"],
        value: value ?? "",
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onValueChange(event.target.value),
      },
      childArray
    );
  }

  return {
    Select,
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) =>
      React.createElement("option", { value }, children),
  };
});

function QuoteTrigger() {
  const { openQuote } = useQuoteModal();
  return (
    <button type="button" onClick={() => openQuote()}>
      Abrir orçamento
    </button>
  );
}

describe("consumidores de createLead em diálogo", () => {
  beforeEach(() => {
    mocks.createLead.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.trackEvent.mockReset();
  });

  it("mantém o atendimento rápido aberto, preserva a mensagem e não rastreia falha", async () => {
    const user = userEvent.setup();
    mocks.createLead
      .mockRejectedValueOnce(new Error("Atendimento indisponível."))
      .mockResolvedValueOnce(undefined);

    render(<WhatsAppSupport />);

    await user.click(screen.getByRole("button", { name: "Abrir atendimento" }));
    const message = await screen.findByPlaceholderText("Escreva sua mensagem para a equipe de atendimento");
    await user.type(message, "Preciso de informações sobre um curso.");
    await user.click(screen.getByRole("button", { name: "Enviar solicitação" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Atendimento indisponível."));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(message).toHaveValue("Preciso de informações sobre um curso.");
    expect(mocks.trackEvent).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Enviar solicitação" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
    expect(mocks.trackEvent).toHaveBeenCalledWith("lead_enviado", { origin: "atendimento_rapido" });
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it("rastreia a saída para WhatsApp sem dados pessoais", async () => {
    const user = userEvent.setup();

    render(<WhatsAppSupport />);

    await user.click(screen.getByRole("button", { name: "Abrir atendimento" }));
    await user.click(await screen.findByRole("link", { name: "Ir para WhatsApp" }));

    expect(mocks.trackEvent).toHaveBeenCalledWith("canal_contato", {
      channel: "whatsapp",
      origin: "atendimento_rapido"
    });
  });

  it("mantém o orçamento aberto com todos os campos e fecha somente após retry bem-sucedido", async () => {
    const user = userEvent.setup();
    mocks.createLead
      .mockRejectedValueOnce(new Error("Orçamento indisponível."))
      .mockResolvedValueOnce(undefined);

    render(
      <QuoteModalProvider>
        <QuoteTrigger />
      </QuoteModalProvider>
    );

    await user.click(screen.getByRole("button", { name: "Abrir orçamento" }));
    fireEvent.change(await screen.findByPlaceholderText("Ex.: Prefeitura de..."), {
      target: { value: "Prefeitura Exemplo" },
    });
    fireEvent.change(screen.getByPlaceholderText("00.000.000/0000-00"), {
      target: { value: "12.345.678/0001-90" },
    });
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "30");
    fireEvent.change(screen.getByPlaceholderText("Ex.: Brasília - DF"), {
      target: { value: "Brasília - DF" },
    });
    fireEvent.change(screen.getByPlaceholderText("Ex.: Próximo trimestre"), {
      target: { value: "Próximo trimestre" },
    });
    await user.selectOptions(selects[1], "Ao vivo (online)");
    fireEvent.change(
      screen.getByPlaceholderText("Descreva conteúdos, normas ou condições especiais."),
      { target: { value: "Incluir casos práticos da organização." } }
    );
    fireEvent.change(screen.getByPlaceholderText("Ex.: Ana Souza"), {
      target: { value: "Ana Souza" },
    });
    fireEvent.change(screen.getByPlaceholderText("Ex.: Gestor de RH"), {
      target: { value: "Gestora de RH" },
    });
    fireEvent.change(screen.getByPlaceholderText("voce@empresa.com.br"), {
      target: { value: "ana@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("(61) 99999-9999"), {
      target: { value: "61999998888" },
    });

    await user.click(screen.getByRole("button", { name: "Enviar solicitação" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Orçamento indisponível.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ex.: Prefeitura de...")).toHaveValue("Prefeitura Exemplo");
    expect(screen.getByPlaceholderText("00.000.000/0000-00")).toHaveValue("12.345.678/0001-90");
    expect(selects[0]).toHaveValue("30");
    expect(screen.getByPlaceholderText("Ex.: Brasília - DF")).toHaveValue("Brasília - DF");
    expect(screen.getByPlaceholderText("Ex.: Próximo trimestre")).toHaveValue("Próximo trimestre");
    expect(selects[1]).toHaveValue("Ao vivo (online)");
    expect(screen.getByPlaceholderText("Descreva conteúdos, normas ou condições especiais.")).toHaveValue(
      "Incluir casos práticos da organização."
    );
    expect(screen.getByPlaceholderText("Ex.: Ana Souza")).toHaveValue("Ana Souza");
    expect(screen.getByPlaceholderText("Ex.: Gestor de RH")).toHaveValue("Gestora de RH");
    expect(screen.getByPlaceholderText("voce@empresa.com.br")).toHaveValue("ana@example.com");
    expect(screen.getByPlaceholderText("(61) 99999-9999")).toHaveValue("(61) 99999-8888");
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Enviar solicitação" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Solicitação de orçamento registrada.");
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });
});
