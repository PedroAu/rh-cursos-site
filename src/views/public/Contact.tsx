"use client";

import { Mail, MapPin, MessageCircle, PhoneCall, Send } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/lib/app-store";
import { trackEvent } from "@/lib/analytics";
import { company } from "@/lib/company";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const contactSchema = z.object({
  name: z.string().trim().min(3, "Nome deve ter no mínimo 3 caracteres."),
  email: z
    .string()
    .trim()
    .min(1, "Informe um e-mail válido.")
    .refine((value) => emailRegex.test(value), "Informe um e-mail válido."),
  phone: z
    .string()
    .trim()
    .refine((value) => !value || getPhoneDigits(value).length >= 10, "Informe um telefone válido com pelo menos 10 dígitos."),
  organization: z.string(),
  courseInterest: z.string(),
  message: z.string().trim().min(10, "Mensagem deve ter no mínimo 10 caracteres.")
});

type ContactFormValues = z.infer<typeof contactSchema>;

const defaultValues: ContactFormValues = {
  name: "",
  email: "",
  phone: "",
  organization: "",
  courseInterest: "",
  message: ""
};

const contactItems = [
  {
    icon: PhoneCall,
    title: "TELEFONES",
    headline: company.phones.primary,
    detail: `${company.phones.whatsapp} (WhatsApp)`,
    href: "tel:+556139651929"
  },
  {
    icon: MapPin,
    title: "LOCALIZAÇÃO",
    headline: `${company.address.district}, ${company.address.cityState}`,
    detail: "Atendimento de Segunda a Sexta, das 08h às 18h."
  }
];

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function getPhoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function ContactPage() {
  const { createLead } = useAppStore();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues
  });

  const clearFeedback = () => {
    setSubmitError(null);
    setSubmitSuccess(null);
  };

  const submit = handleSubmit(async (values) => {
    clearFeedback();

    try {
      await createLead({
        name: values.name,
        email: values.email,
        phone: values.phone,
        type: "Contato",
        courseInterest: values.courseInterest.trim() || "Contato pelo site",
        organization: values.organization.trim() || undefined,
        origin: "Contato",
        message: values.message
      });
      trackEvent("lead_enviado", { origin: "formulario_contato" });

      const successMessage = "Mensagem registrada. Nossa equipe retorna com orientação inicial e próximos passos.";
      toast.success("Mensagem registrada para atendimento.");
      reset(defaultValues);
      setSubmitSuccess(successMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível enviar sua mensagem.";
      setSubmitError(message);
      toast.error(message);
    }
  });

  return (
    <div className="bg-tk-surface-2">
      <section className="border-b border-outline-variant bg-white">
        <div className="ea-container py-12 md:py-14">
          <div className="max-w-4xl space-y-4">
            <h1 className="font-tk-display text-display-large font-bold leading-tight tracking-[var(--tk-tracking-display)] text-tk-ink">
              Entre em Contato
            </h1>
            <p className="max-w-3xl font-tk-serif text-subheading leading-relaxed text-tk-ink-muted">
              Estamos prontos para atender suas dúvidas sobre treinamentos corporativos e gestão pública. Fale conosco
              através do formulário ou nossos canais diretos.
            </p>
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="ea-container grid gap-8 xl:grid-cols-[0.9fr_1.1fr] xl:items-start">
          <div className="space-y-6">
            {contactItems.map((item) => {
              const Icon = item.icon;

              return (
                <Card key={item.title} className="border-outline-variant bg-surface-container-lowest shadow-card">
                  <CardContent className="mt-0 flex items-start gap-4 p-6">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-tk-brand/10 text-tk-brand">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-label font-bold uppercase tracking-[0.08em] text-tk-brand">{item.title}</p>
                      <p className="mt-2 font-tk-display text-[1.35rem] font-bold tracking-[var(--tk-tracking-display)] text-tk-ink">
                        {"href" in item ? (
                          <a
                            className="underline decoration-tk-brand/30 underline-offset-4 hover:decoration-tk-brand"
                            href={item.href}
                            onClick={() => trackEvent("canal_contato", { channel: "telefone", origin: "pagina_contato" })}
                          >
                            {item.headline}
                          </a>
                        ) : (
                          item.headline
                        )}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-tk-ink-muted">{item.detail}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <div
              className="h-[280px] overflow-hidden rounded-xl border border-outline-variant bg-cover bg-center grayscale"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(60,63,69,0.48), rgba(60,63,69,0.48)), url('/images/home-hero-reference.jpg')"
              }}
              role="img"
              aria-label="Mapa da região de Brasília"
            />

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <a
                  href={company.links.whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => trackEvent("canal_contato", { channel: "whatsapp", origin: "pagina_contato" })}
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline" className="border-outline-variant text-tk-ink hover:bg-surface-muted">
                <a
                  href={company.links.email}
                  onClick={() => trackEvent("canal_contato", { channel: "email", origin: "pagina_contato" })}
                >
                  <Mail className="h-4 w-4" />
                  E-mail
                </a>
              </Button>
            </div>
          </div>

          <Card className="border-outline-variant bg-surface-container-lowest shadow-card" data-testid="ui-contact-form">
            <CardContent className="grid gap-6 p-8 md:p-10">
              <div className="flex items-center gap-4">
                <div className="h-12 w-1 rounded-full bg-tk-accent" aria-hidden />
                <div className="space-y-1">
                  <p className="text-label font-bold uppercase tracking-[0.08em] text-tk-brand">Atendimento</p>
                  <h2 className="font-tk-display text-h2-compact font-bold tracking-[var(--tk-tracking-display)] text-tk-ink">
                    Envie uma mensagem
                  </h2>
                </div>
              </div>

              {submitError ? (
                <div role="alert" className="rounded-lg border border-tk-error/25 bg-tk-error/10 px-4 py-3 text-sm text-tk-error">
                  {submitError}
                </div>
              ) : null}

              {submitSuccess ? (
                <div aria-live="polite" className="rounded-lg border border-tk-success/25 bg-tk-success/10 px-4 py-3 text-sm text-tk-success">
                  {submitSuccess}
                </div>
              ) : null}

              <form noValidate className="grid gap-5" onSubmit={submit}>
                <div className="grid gap-5 md:grid-cols-2">
                  <FormField error={errors.name?.message} label="Nome completo" required>
                    {({ fieldId, ariaDescribedBy, ariaInvalid }) => (
                      <Input
                        id={fieldId}
                        autoComplete="name"
                        placeholder="Seu nome"
                        aria-describedby={ariaDescribedBy}
                        aria-invalid={ariaInvalid}
                        {...register("name", { onChange: clearFeedback })}
                      />
                    )}
                  </FormField>

                  <FormField error={errors.email?.message} label="E-mail" required>
                    {({ fieldId, ariaDescribedBy, ariaInvalid }) => (
                      <Input
                        id={fieldId}
                        type="email"
                        autoComplete="email"
                        placeholder="email@empresa.com.br"
                        aria-describedby={ariaDescribedBy}
                        aria-invalid={ariaInvalid}
                        {...register("email", { onChange: clearFeedback })}
                      />
                    )}
                  </FormField>
                </div>

                <Controller
                  control={control}
                  name="phone"
                  render={({ field }) => (
                    <FormField error={errors.phone?.message} label="Telefone / WhatsApp">
                      {({ fieldId, ariaDescribedBy, ariaInvalid }) => (
                        <Input
                          id={fieldId}
                          autoComplete="tel"
                          inputMode="tel"
                          placeholder="(00) 00000-0000"
                          value={field.value}
                          aria-describedby={ariaDescribedBy}
                          aria-invalid={ariaInvalid}
                          onChange={(event) => {
                            clearFeedback();
                            field.onChange(formatPhone(event.target.value));
                          }}
                        />
                      )}
                    </FormField>
                  )}
                />

                <div className="grid gap-5 md:grid-cols-2">
                  <FormField label="Empresa / órgão">
                    {({ fieldId, ariaDescribedBy, ariaInvalid }) => (
                      <Input
                        id={fieldId}
                        autoComplete="organization"
                        placeholder="Prefeitura ou empresa"
                        aria-describedby={ariaDescribedBy}
                        aria-invalid={ariaInvalid}
                        {...register("organization", { onChange: clearFeedback })}
                      />
                    )}
                  </FormField>

                  <FormField label="Curso ou tema de interesse">
                    {({ fieldId, ariaDescribedBy, ariaInvalid }) => (
                      <Input
                        id={fieldId}
                        placeholder="Ex.: eSocial"
                        aria-describedby={ariaDescribedBy}
                        aria-invalid={ariaInvalid}
                        {...register("courseInterest", { onChange: clearFeedback })}
                      />
                    )}
                  </FormField>
                </div>

                <FormField error={errors.message?.message} label="Mensagem" required>
                  {({ fieldId, ariaDescribedBy, ariaInvalid }) => (
                    <Textarea
                      id={fieldId}
                      placeholder="Como podemos ajudar sua organização?"
                      rows={6}
                      aria-describedby={ariaDescribedBy}
                      aria-invalid={ariaInvalid}
                      {...register("message", { onChange: clearFeedback })}
                    />
                  )}
                </FormField>

                <Button
                  type="submit"
                  loading={isSubmitting}
                  size="lg"
                  className="w-fit"
                >
                  <Send className="h-4 w-4" />
                  {isSubmitting ? "Enviando..." : "Enviar mensagem"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
