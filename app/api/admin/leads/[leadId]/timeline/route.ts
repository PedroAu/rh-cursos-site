import { NextResponse } from "next/server";

import { listLeadTimeline, normalizeTimelineQuery } from "@/features/admin/leads/timeline/server";
import { logger } from "@/lib/logger";
import { applyNoStore } from "@/lib/security-headers";
import { requireAdminApi } from "@/lib/supabase/admin-api-auth";

export async function GET(request: Request, context: { params: Promise<{ leadId: string }> }) {
  return applyNoStore(await handleGet(request, context));
}

async function handleGet(request: Request, context: { params: Promise<{ leadId: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { leadId } = await context.params;
  if (!leadId || leadId.length > 80) {
    return NextResponse.json({ ok: false, error: "Lead inválido." }, { status: 400 });
  }

  try {
    const filters = normalizeTimelineQuery(new URL(request.url).searchParams);
    const data = await listLeadTimeline(guard.adminClient, leadId, filters);
    return NextResponse.json({ ok: true, data, count: data.length });
  } catch (error) {
    logger.error("api/admin/leads/timeline.list error", { err: error, leadId });
    return NextResponse.json({ ok: false, error: "Erro ao carregar a linha do tempo." }, { status: 500 });
  }
}
