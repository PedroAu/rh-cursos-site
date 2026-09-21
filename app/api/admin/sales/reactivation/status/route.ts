import { NextResponse } from "next/server";

import {
  DEFAULT_SALES_CAMPAIGN_KEY,
  getReactivationStatus,
  salesCampaignKeySchema,
} from "@/features/sales/reactivation/status";
import { logger } from "@/lib/logger";
import { applyNoStore } from "@/lib/security-headers";
import { requireAdminApi } from "@/lib/supabase/admin-api-auth";

function readCampaignKey(request: Request): string | null {
  const requested = new URL(request.url).searchParams.get("campaignKey");
  if (requested === null) return DEFAULT_SALES_CAMPAIGN_KEY;
  const parsed = salesCampaignKeySchema.safeParse(requested);
  return parsed.success ? parsed.data : null;
}

export async function GET(request: Request) {
  return applyNoStore(await handleGet(request));
}

async function handleGet(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const campaignKey = readCampaignKey(request);
  if (!campaignKey) {
    return NextResponse.json({ ok: false, error: "Campanha inválida." }, { status: 400 });
  }
  try {
    const status = await getReactivationStatus(guard.adminClient, campaignKey);
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    logger.error("api/admin/sales/reactivation/status error", {
      err: error,
      route: "api/admin/sales/reactivation/status",
    });
    return NextResponse.json({ ok: false, error: "Erro ao consultar o orquestrador." }, { status: 500 });
  }
}
