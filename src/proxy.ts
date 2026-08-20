import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { serverEnv } from "@/lib/validation/env";

/**
 * Next.js proxy (renamed from middleware in Next.js 16).
 *
 * Responsibilities:
 *  1. Refresh the NextAuth JWT cookie on every request to /(app)/* and /api/*
 *  2. Redirect unauthenticated users away from /(app)/* to /signin
 *  3. Redirect signed-in users away from /signin to /app (or /setup if no agency)
 *
 * Server-side route gates still need to call `auth()` for the canonical
 * session — this proxy is for redirect UX + cookie refresh, not authorization.
 *
 * Cookie name: NextAuth v5 in production (HTTPS) issues the session cookie
 * as `__Secure-authjs.session-token`; in dev (HTTP) it's
 * `authjs.session-token`. `getToken()` defaults `cookieName` and `salt` to
 * the non-secure name when `secureCookie` is not passed, which silently
 * returns null on every prod request after a successful magic-link or
 * Google sign-in (cookie exists under a different name). The user lands
 * back on /signin?callbackUrl=/app with no obvious error. We auto-detect
 * the right mode from the request protocol (also honoring X-Forwarded-Proto
 * when behind Traefik / Cloudflare).
 */
function isSecureRequest(req: NextRequest): boolean {
  if (req.nextUrl.protocol === "https:") return true;
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded && forwarded.toLowerCase() === "https") return true;
  return false;
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Static assets + Next internals + public API — pass through
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/health" ||
    pathname === "/api/bootstrap/status" ||
    // Dev/test-only helpers — guarded server-side by NODE_ENV !== "production".
    // The dev/* endpoints refuse to run in production builds, so allowing
    // them through the proxy is safe (they just 404 in prod).
    (pathname.startsWith("/api/dev/") && serverEnv.NODE_ENV !== "production") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  const secureCookie = isSecureRequest(req);
  const token = await getToken({
    req,
    secret: serverEnv.AUTH_SECRET,
    secureCookie,
    // salt intentionally omitted: getToken defaults salt = cookieName,
    // which is exactly what NextAuth() uses to write the JWT. Passing a
    // hardcoded non-secure salt here used to silently break prod auth.
  });

  const isAuthed = !!token?.sub;

  // Authenticated app routes — require session
  if (pathname.startsWith("/app") || pathname.startsWith("/api/")) {
    if (!isAuthed) {
      const url = req.nextUrl.clone();
      url.pathname = "/signin";
      url.search = `?callbackUrl=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }

  // Sign-in page — redirect authed users to /app
  if (pathname === "/signin" && isAuthed) {
    const url = req.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Run on everything except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - public files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
