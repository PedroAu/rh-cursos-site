"use client";

import { useState } from "react";
import { MessageCircle, PhoneCall } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useDisclosure } from "@/hooks/use-disclosure";
import { company } from "@/lib/company";
import { trackEvent } from "@/lib/analytics";
import { useAppStore } from "@/lib/app-store";

const supportOptions = [
  "Quero saber sobre cursos",
  "Quero orçamento para empresa",
  "Quero turma in company",
  "Quero ajuda com inscrição",
  "Quero informações sobre pagamento"
];

export function WhatsAppSupport() {
  const { createLead } = useAppStore();
  const [opened, { open, close }] = useDisclosure(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitLead = async () => {
    try {
      setIsSubmitting(true);
      await createLead({
        name: "Lead do atendimento",
        email: company.email,
        phone: company.phones.whatsapp,
        type: "Contato",
        courseInterest: "Atendimento geral",
        origin: "WhatsApp",
        message: message || "Solicitação enviada pelo atendimento rápido"
      });
      trackEvent("lead_enviado", { origin: "atendimento_rapido" });
      toast.success("A equipe vai retornar pelo canal institucional.");
      close();
      setMessage("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar a solicitação."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={opened}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          open();
          return;
        }

        close();
      }}
    >
      <button
        id="atendimento"
        onClick={open}
        aria-label="Abrir atendimento"
        className="fixed bottom-5 right-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-tk-accent-soft text-tk-brand-hover shadow-[0_16px_36px_rgba(10,32,56,0.2)] transition-transform duration-200 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tk-focus focus-visible:ring-offset-2"
        type="button"
      >
        <MessageCircle className="h-6 w-6" aria-hidden="true" />
      </button>

      <DialogContent
        className="w-[min(92vw,40rem)] rounded-lg border-border bg-card p-0"
        onPointerDownOutside={() => {
          if (!isSubmitting) {
            close();
          }
        }}
      >
        <div className="space-y-6 p-6">
          <DialogHeader className="mb-0 space-y-2">
            <DialogTitle>Atendimento rápido</DialogTitle>
            <DialogDescription>
              Escolha um assunto inicial ou escreva sua solicitação para a
              equipe de atendimento.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            {supportOptions.map((option) => (
              <button
                key={option}
                onClick={() => setMessage(option)}
                className="rounded-lg border border-border bg-muted px-4 py-3 text-left text-sm font-semibold text-foreground transition-colors hover:border-tk-accent hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tk-focus focus-visible:ring-offset-2"
                type="button"
              >
                {option}
              </button>
            ))}
          </div>

          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Escreva sua mensagem para a equipe de atendimento"
            rows={4}
          />

          <DialogFooter className="flex-col gap-3 sm:grid sm:grid-cols-2 sm:justify-stretch">
            <Button
              variant="primary"
              className="w-full"
              onClick={submitLead}
              loading={isSubmitting}
            >
              <PhoneCall className="h-4 w-4" aria-hidden="true" />
              Enviar solicitação
            </Button>
            <Button asChild variant="outline" className="w-full">
              <a
                href={company.links.whatsapp}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  trackEvent("canal_contato", {
                    channel: "whatsapp",
                    origin: "atendimento_rapido"
                  })
                }
              >
                Ir para WhatsApp
              </a>
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
