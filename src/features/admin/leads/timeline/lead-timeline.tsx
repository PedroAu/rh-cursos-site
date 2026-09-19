"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Mail,
  MousePointerClick,
  RefreshCw,
  Reply,
  ShieldAlert,
  UserMinus,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LEAD_INTERACTION_LABELS } from "@/features/admin/leads/timeline/model";
import {
  LEAD_INTERACTION_TYPES,
  type LeadInteraction,
  type LeadInteractionType,
} from "@/features/admin/leads/timeline/types";

const ICONS: Record<LeadInteractionType, LucideIcon> = {
  SENT: Mail,
  DELIVERED: CheckCircle2,
  OPENED: Eye,
  CLICKED: MousePointerClick,
  REPLIED: Reply,
  BOUNCED: AlertTriangle,
  COMPLAINED: ShieldAlert,
  UNSUBSCRIBED: UserMinus,
};

const DIRECTION_LABEL = { OUTBOUND: "saída", INBOUND: "entrada" } as const;

function readInitialFilters() {
  if (typeof window === "undefined") return { types: [] as LeadInteractionType[], from: "", to: "" };
  const params = new URLSearchParams(window.location.search);
  const allowed = new Set<string>(LEAD_INTERACTION_TYPES);
  return {
    types: (params.get("timelineTypes") ?? "").split(",").filter((type): type is LeadInteractionType => allowed.has(type)),
    from: params.get("timelineFrom") ?? "",
    to: params.get("timelineTo") ?? "",
  };
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/Sao_Paulo",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function LeadTimeline({ leadId }: { leadId: string }) {
  const initial = useMemo(() => readInitialFilters(), []);
  const [types, setTypes] = useState<LeadInteractionType[]>(initial.types);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [events, setEvents] = useState<LeadInteraction[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (types.length) params.set("types", types.join(","));
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("limit", "200");
    return params.toString();
  }, [from, to, types]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (types.length) params.set("timelineTypes", types.join(",")); else params.delete("timelineTypes");
    if (from) params.set("timelineFrom", from); else params.delete("timelineFrom");
    if (to) params.set("timelineTo", to); else params.delete("timelineTo");
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
  }, [from, to, types]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    fetch(`/api/admin/leads/${encodeURIComponent(leadId)}/timeline?${queryString}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("timeline request failed");
        const body = (await response.json()) as { data?: LeadInteraction[] };
        setEvents(body.data ?? []);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [leadId, queryString, reloadKey]);

  const toggleType = useCallback((type: LeadInteractionType) => {
    setTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);
  }, []);

  const clearFilters = () => {
    setTypes([]);
    setFrom("");
    setTo("");
  };
  const hasFilters = Boolean(types.length || from || to);

  return (
    <section className="border-t border-tk-line px-6 py-6" aria-labelledby={`lead-timeline-${leadId}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 id={`lead-timeline-${leadId}`} className="text-xl font-bold text-tk-ink">Linha do tempo</h3>
          <p className="mt-1 text-sm text-tk-ink-muted">Interações de e-mail auditáveis deste lead.</p>
        </div>
        <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)} aria-label="Recarregar linha do tempo">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Recarregar
        </Button>
      </div>

      <div className="mt-5 rounded-2xl border border-tk-line bg-tk-surface-2 p-4">
        <p id={`timeline-type-label-${leadId}`} className="text-sm font-bold text-tk-ink">Filtrar por tipo</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-labelledby={`timeline-type-label-${leadId}`}>
          {LEAD_INTERACTION_TYPES.map((type) => {
            const selected = types.includes(type);
            return (
              <button
                key={type}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleType(type)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tk-accent",
                  selected ? "border-tk-brand bg-tk-brand text-white" : "border-tk-line bg-tk-surface text-tk-ink",
                )}
              >
                {LEAD_INTERACTION_LABELS[type]}
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="text-sm font-semibold text-tk-ink">
            De
            <input aria-label="Data inicial da linha do tempo" type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.currentTarget.value)} className="mt-1 block w-full rounded-xl border border-tk-line bg-tk-surface px-3 py-2" />
          </label>
          <label className="text-sm font-semibold text-tk-ink">
            Até
            <input aria-label="Data final da linha do tempo" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.currentTarget.value)} className="mt-1 block w-full rounded-xl border border-tk-line bg-tk-surface px-3 py-2" />
          </label>
          <Button variant="ghost" onClick={clearFilters} disabled={!hasFilters}>Limpar filtros</Button>
        </div>
      </div>

      <div className="mt-6" aria-live="polite" aria-busy={status === "loading"}>
        {status === "loading" ? <p className="rounded-2xl bg-tk-surface-2 p-5 text-sm text-tk-ink-muted">Carregando interações…</p> : null}
        {status === "error" ? (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5">
            <p className="font-semibold text-tk-error">Não foi possível carregar a linha do tempo.</p>
            <p className="mt-1 text-sm text-tk-ink-muted">Os demais dados do lead continuam disponíveis.</p>
          </div>
        ) : null}
        {status === "ready" && events.length === 0 ? (
          <p className="rounded-2xl bg-tk-surface-2 p-5 text-sm text-tk-ink-muted">
            {hasFilters ? "Nenhuma interação encontrada para os filtros aplicados." : "Este lead ainda não possui interações de e-mail registradas."}
          </p>
        ) : null}
        {status === "ready" && events.length ? (
          <ol className="space-y-4" aria-label="Interações do lead">
            {events.map((event) => {
              const Icon = ICONS[event.eventType];
              return (
                <li key={event.id} className="relative rounded-2xl border border-tk-line bg-tk-surface p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tk-accent-soft text-tk-brand" aria-hidden="true"><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="font-bold text-tk-ink">{LEAD_INTERACTION_LABELS[event.eventType]}</p>
                        <span className="text-xs font-semibold uppercase tracking-wide text-tk-ink-muted">{DIRECTION_LABEL[event.direction]} · E-mail · {event.source}</span>
                      </div>
                      <time className="mt-1 block text-sm text-tk-ink-muted" dateTime={event.occurredAt}>{formatTimestamp(event.occurredAt)}</time>
                      <p className="mt-3 text-sm leading-6 text-tk-ink">{event.safeSummary}</p>
                      <details className="mt-3 text-xs text-tk-ink-muted">
                        <summary className="cursor-pointer font-semibold">Dados de auditoria</summary>
                        <dl className="mt-2 grid gap-1 break-all sm:grid-cols-2">
                          <div><dt className="inline font-semibold">Origem: </dt><dd className="inline">{event.source}</dd></div>
                          <div><dt className="inline font-semibold">Evento externo: </dt><dd className="inline">{event.externalEventId ?? "—"}</dd></div>
                          <div><dt className="inline font-semibold">Correlação: </dt><dd className="inline">{event.correlationId}</dd></div>
                          <div><dt className="inline font-semibold">Registrado: </dt><dd className="inline">{formatTimestamp(event.recordedAt)}</dd></div>
                          <div><dt className="inline font-semibold">Ator: </dt><dd className="inline">{event.actorId} · {event.actorVersion}</dd></div>
                        </dl>
                      </details>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
