import { NextResponse } from "next/server";

import { getReactivationStatus } from "@/features/sales/reactivation/status";
import { logger } from "@/lib/logger";
import { applyNoStore } from "@/lib/security-headers";
import { requireAdminApi } from "@/lib/supabase/admin-api-auth";

export async function GET() {
  return applyNoStore(await handleGet());
}

async function handleGet() {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  try {
    const status = await getReactivationStatus(guard.adminClient);
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    logger.error("api/admin/sales/reactivation/status error", {
      err: error,
      route: "api/admin/sales/reactivation/status",
    });
    return NextResponse.json({ ok: false, error: "Erro ao consultar o orquestrador." }, { status: 500 });
  }
}
