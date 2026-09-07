import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { applySecurityHeaders } from "@/lib/security-headers";
import {
  requiresSupabaseSession,
  updateSupabaseSession,
} from "@/lib/supabase/middleware";

const CANONICAL_HOST = "www.rhcursos.com.br";
const APEX_HOST = "rhcursos.com.br";
// Matches only the legacy URLs classified as high-confidence 404
// replacements. Keep this map exact: broad pattern redirects can conceal
// unrelated content or turn a useful 404 into an incorrect destination.
const LEGACY_REDIRECTS: Readonly<Record<string, string>> = {
  "/agenda-cursos": "/agenda/",
  "/cursos-in-company": "/in-company/",
  "/especialista": "/falar-com-especialista/",
  "/informa-es-do-evento-e-registro/curso-de-interpretacao-dos-requisitos-da-norma-iso-iec-20000-1-1":
    "/cursos/curso-de-interpretacao-dos-requisitos-da-norma-iso-iec-20000-1/",
  "/informa-es-do-evento-e-registro/curso-intensivo-e-pratico-de-esocial-para-orgaos-publicos-2024-01-24-08-30":
    "/cursos/curso-de-esocial-pratico-para-orgaos-publicos-atualizado-com-o-novo-leiaute-1-3/",
};

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase().split(":")[0];
  const { pathname } = request.nextUrl;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol ?? request.nextUrl.protocol.replace(":", "");
  const isCanonicalHost = host === CANONICAL_HOST || host === APEX_HOST;
  const legacyTarget = LEGACY_REDIRECTS[pathname];

  // Send every legacy variant straight to the canonical destination in one
  // permanent hop, retaining campaign/query attribution.
  if (legacyTarget) {
    const redirectUrl = new URL(legacyTarget, `https://${CANONICAL_HOST}`);
    redirectUrl.search = request.nextUrl.search;

    return applySecurityHeaders(NextResponse.redirect(redirectUrl, 301));
  }

  // Cloudflare should enforce HTTPS at the edge for every request, including
  // robots.txt and sitemap.xml. This application-level guard keeps the
  // canonical host invariant intact when traffic reaches the Worker directly
  // or when the edge rule is accidentally removed.
  if (isCanonicalHost && protocol !== "https") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.protocol = "https";
    redirectUrl.host = CANONICAL_HOST;

    return applySecurityHeaders(NextResponse.redirect(redirectUrl, 308));
  }

  if (pathname === "/curso" || pathname === "/curso/") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/cursos";
    redirectUrl.search = "";

    if (host === APEX_HOST) {
      redirectUrl.protocol = "https";
      redirectUrl.host = CANONICAL_HOST;
    }

    return applySecurityHeaders(NextResponse.redirect(redirectUrl, 301));
  }

  if (host === APEX_HOST) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.protocol = "https";
    redirectUrl.host = CANONICAL_HOST;

    return applySecurityHeaders(NextResponse.redirect(redirectUrl, 308));
  }

  // These machine-readable routes do not need a Supabase session refresh.
  // They still pass through the canonicalization guard above so HTTP variants
  // cannot expose duplicate sitemap/robots resources.
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    return applySecurityHeaders(NextResponse.next());
  }

  if (!requiresSupabaseSession(pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  return applySecurityHeaders(await updateSupabaseSession(request));
}

export const config = {
  runtime: "experimental-edge",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
