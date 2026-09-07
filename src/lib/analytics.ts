/**
 * Google Analytics 4 — helpers de funil (EP-1.3).
 *
 * O Measurement ID vem de `NEXT_PUBLIC_GA_MEASUREMENT_ID`. Quando ausente
 * (dev local sem ID), tudo aqui vira no-op: nenhum script é injetado pelo
 * layout e `trackEvent` não faz nada — sem erro, sem chamada de rede.
 *
 * Compatível com Cloudflare Workers/OpenNext: usa apenas APIs de browser
 * (`window.gtag`) em chamadas client-side, sem dependência de runtime Node.
 */

import { sendGAEvent } from "@next/third-parties/google";

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";
export const ANALYTICS_CONSENT_STORAGE_KEY = "rhcursos_analytics_consent";

/** GA4 está ativo apenas quando há um Measurement ID configurado. */
export const isAnalyticsEnabled = GA_MEASUREMENT_ID.length > 0;

/** Consentimento explícito do visitante para métricas não essenciais (LGPD). */
export function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) === "granted";
  } catch {
    return false;
  }
}

/** Eventos de funil instrumentados nesta fase. */
export type FunnelEvent =
  | "inscricao_cta"
  | "lead_enviado"
  | "checkout_iniciado"
  | "canal_contato";

/**
 * Envia um evento de funil ao GA4. No-op quando o GA está inativo.
 * Não enviar PII nos params — apenas metadados de contexto.
 */
export function trackEvent(
  event: FunnelEvent,
  params?: Record<string, string | number | boolean>
): void {
  if (!isAnalyticsEnabled) return;
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;

  sendGAEvent("event", event, params ?? {});
}
