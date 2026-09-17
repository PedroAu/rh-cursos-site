import { describe, expect, it } from "vitest";

import {
  filterTimeline,
  isTerminalInteraction,
  LEAD_INTERACTION_LABELS,
  parseTimelineTypes,
  shouldSuppressLead,
  sortTimeline,
} from "@/features/admin/leads/timeline/model";
import { LEAD_INTERACTION_TYPES, type LeadInteraction } from "@/features/admin/leads/timeline/types";

function event(id: string, eventType: LeadInteraction["eventType"], occurredAt: string): LeadInteraction {
  return {
    id,
    leadId: "lead-1",
    eventType,
    occurredAt,
    recordedAt: "2026-09-16T12:00:00.000Z",
    channel: "EMAIL",
    direction: eventType === "REPLIED" ? "INBOUND" : "OUTBOUND",
    source: eventType === "REPLIED" ? "IMAP" : "SES",
    safeSummary: "Resumo seguro.",
    externalEventId: null,
    correlationId: "sequence-1",
    causationId: null,
    actorId: "test",
    actorVersion: "v1",
    contentRef: null,
    contentHash: null,
    metadata: {},
  };
}

describe("lead timeline domain", () => {
  it("mantém a taxonomia canônica e os oito rótulos em português", () => {
    expect(Object.keys(LEAD_INTERACTION_LABELS)).toEqual(LEAD_INTERACTION_TYPES);
    expect(Object.values(LEAD_INTERACTION_LABELS)).toEqual([
      "Enviado", "Entregue", "Aberto", "Clicado", "Respondido", "Bounce", "Reclamação", "Descadastro",
    ]);
  });

  it("interrompe para resposta/bounce/reclamação/descadastro e só suprime os três últimos", () => {
    expect(LEAD_INTERACTION_TYPES.filter(isTerminalInteraction)).toEqual([
      "REPLIED", "BOUNCED", "COMPLAINED", "UNSUBSCRIBED",
    ]);
    expect(LEAD_INTERACTION_TYPES.filter(shouldSuppressLead)).toEqual([
      "BOUNCED", "COMPLAINED", "UNSUBSCRIBED",
    ]);
  });

  it("ordena por occurredAt desc e usa id desc como desempate determinístico", () => {
    const events = [
      event("a", "SENT", "2026-09-15T12:00:00.000Z"),
      event("b", "OPENED", "2026-09-16T12:00:00.000Z"),
      event("c", "CLICKED", "2026-09-16T12:00:00.000Z"),
    ];
    expect(sortTimeline(events).map((item) => item.id)).toEqual(["c", "b", "a"]);
  });

  it("filtra tipo/período e ignora tipos desconhecidos na query", () => {
    const events = [
      event("a", "SENT", "2026-09-14T12:00:00.000Z"),
      event("b", "OPENED", "2026-09-15T12:00:00.000Z"),
      event("c", "OPENED", "2026-09-16T12:00:00.000Z"),
    ];
    expect(filterTimeline(events, { types: ["OPENED"], from: "2026-09-16", to: "2026-09-16" }).map((item) => item.id)).toEqual(["c"]);
    expect(parseTimelineTypes("OPENED,INVALID,OPENED,SENT")).toEqual(["OPENED", "SENT"]);
  });
});

