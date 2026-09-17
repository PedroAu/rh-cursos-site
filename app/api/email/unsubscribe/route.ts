import { NextResponse } from "next/server";

import { ingestUnsubscribeEvent } from "@/features/admin/leads/timeline/ingestion";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import { applyApiSecurityHeaders } from "@/lib/security-headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function json(body: unknown, init?: ResponseInit) {
  return applyApiSecurityHeaders(NextResponse.json(body, init));
}

export async function POST(request: Request) {
  let token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token && request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) {
    token = String((await request.formData()).get("token") ?? "");
  }
  const payload = verifyUnsubscribeToken(token, process.env.EMAIL_UNSUBSCRIBE_SECRET);
  if (!payload) return json({ ok: false, error: "Link inválido ou expirado." }, { status: 400 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false }, { status: 503 });
  const admin = createSupabaseServerClient();
  if (!admin) return json({ ok: false }, { status: 503 });

  try {
    await ingestUnsubscribeEvent(admin, {
      leadId: payload.leadId,
      tokenId: payload.tokenId,
      occurredAt: new Date().toISOString(),
    });
    return json({ ok: true, message: "Descadastro confirmado." });
  } catch {
    return json({ ok: false }, { status: 503 });
  }
}

