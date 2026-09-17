import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ingestSesEvent } from "@/features/admin/leads/timeline/ingestion";
import { isValidWebhookSecret } from "@/lib/email/webhook-auth";
import { readLimitedBody } from "@/lib/http/read-limited-body";
import { logger } from "@/lib/logger";
import { applyApiSecurityHeaders } from "@/lib/security-headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 64 * 1024;

function json(body: unknown, init?: ResponseInit) {
  return applyApiSecurityHeaders(NextResponse.json(body, init));
}

export async function POST(request: Request) {
  if (!isValidWebhookSecret(request.headers.get("x-rh-webhook-secret"), process.env.SES_EVENTS_WEBHOOK_SECRET)) {
    return json({ ok: false }, { status: 401 });
  }
  const rawBody = await readLimitedBody(request, MAX_BODY_BYTES);
  if (rawBody === null) return json({ ok: false }, { status: 413 });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ ok: false }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false }, { status: 503 });
  const admin = createSupabaseServerClient();
  if (!admin) return json({ ok: false }, { status: 503 });

  try {
    const result = await ingestSesEvent(admin, payload);
    return json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    const invalid = error instanceof ZodError || (error instanceof Error && error.message.includes("correlacionável"));
    logger.warn("email.ses event rejected", { reason: error instanceof Error ? error.message : "unknown" });
    return json({ ok: false }, { status: invalid ? 422 : 503 });
  }
}

