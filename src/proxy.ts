import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { serverEnv } from "@/lib/validation/env";
import { runWithRequestContext } from "@/lib/observability/request-context";

/**
 * Next.js proxy (renamed from middleware in Next.js 16).
 *
 * Responsibilities:
 *  1. Mint / propagate a per-request `x-request-id` (correlation id)
 *     so every log line + Sentry event for this request shares the
 *     same id. The id is stored in an AsyncLocalStorage so downstream
 *     helpers (logError, captureError) can read it without each
 *     call-site having to thread it through.
 *  2. Refresh the NextAuth JWT cookie on every request to /(app)/* and /api/*
 *  3. Redirect unauthenticated users away from /(app)/* to /signin
 *  4. Redirect signed-in users away from /signin to /app (or /setup if no agency)
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

/**
 * Read an inbound `x-request-id` header (when a client / upstream
 * proxy already provided one) and validate it is a usable token. We
 * accept any printable ASCII up to 128 chars; reject anything that
 * looks adversarial so an attacker can't poison the log stream
 * with control characters or megabyte-long ids.
 */
function readInboundRequestId(req: NextRequest): string | null {
  const value = req.headers.get("x-request-id")?.trim();
  if (!value) return null;
  if (value.length === 0 || value.length > 128) return null;
  // Allow letters, digits, `-`, `_`, `.`. Reject anything else
  // (whitespace, control chars, quotes, slashes) — enough for UUIDv4
  // and trace-context ids, nothing dangerous.
  if (!/^[A-Za-z0-9._-]+$/.test(value)) return null;
  return value;
}

/**
 * Build a Headers object with the request id attached, suitable for
 * the `request.headers` option of `NextResponse.next()`. The
 * downstream route handler / server action then sees the id via
 * `headers().get('x-request-id')` without us having to thread it
 * through every helper signature.
 */
function withRequestHeaders(req: NextRequest, requestId: string): Headers {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);
  return requestHeaders;
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // ─── request id ────────────────────────────────────────────────
  // Honor an inbound id (Traefik, Cloudflare, the test suite), otherwise
  // mint a fresh UUIDv4. Set it on the inbound request headers so
  // route handlers + server actions can read it via `headers()`.
  const inboundId = readInboundRequestId(req);
  const requestId = inboundId ?? crypto.randomUUID();

  // Static assets + Next internals + public API — pass through
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/auth/") ||
    // Bypass the entire /api/health tree (live + ready + bare alias). The
    // Docker HEALTHCHECK and Traefik loadbalancer probe both hit
    // /api/health/{live,ready}, and they must not be redirected to
    // /signin by the auth check.
    pathname === "/api/health" ||
    pathname.startsWith("/api/health/") ||
    pathname === "/api/bootstrap/status" ||
    // Dev/test-only helpers — guarded server-side by NODE_ENV !== "production".
    // The dev/* endpoints refuse to run in production builds, so allowing
    // them through the proxy is safe (they just 404 in prod).
    (pathname.startsWith("/api/dev/") && serverEnv.NODE_ENV !== "production") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  ) {
    // Even on the bypass path, propagate the request id so a probe
    // failure shows up in logs under the same correlation id.
    const res = NextResponse.next({
      request: { headers: withRequestHeaders(req, requestId) },
    });
    res.headers.set("x-request-id", requestId);
    return res;
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
      const res = NextResponse.redirect(url);
      res.headers.set("x-request-id", requestId);
      return res;
    }
  }

  // Sign-in page — redirect authed users to /app
  if (pathname === "/signin" && isAuthed) {
    const url = req.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    const res = NextResponse.redirect(url);
    res.headers.set("x-request-id", requestId);
    return res;
  }

  // First-login redirect for users created via the "Add directly"
  // admin flow (lib/auth/user-creation.ts:createUserDirectly). The
  // JWT carries `mustChangePassword: true` until the user rotates
  // the admin-supplied password on /set-password. The /set-password
  // action calls `useSession().update({ mustChangePassword: false })`
  // which re-stamps the JWT so subsequent requests pass through.
  //
  // This check runs AFTER the auth gate so an unauthenticated
  // request to /app/* is bounced to /signin first (the user then
  // signs in, lands on /app, and is bounced here to /set-password).
  // The signin / signout / auth endpoints are excluded so the user
  // can escape an infinite redirect if the flow is misconfigured.
  if (
    isAuthed &&
    token?.mustChangePassword === true &&
    pathname !== "/set-password" &&
    pathname !== "/signin" &&
    pathname !== "/signout" &&
    !pathname.startsWith("/api/auth/")
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/set-password";
    url.search = "";
    const res = NextResponse.redirect(url);
    res.headers.set("x-request-id", requestId);
    return res;
  }

  // Default pass-through. Forward the request id on both the
  // rewritten inbound headers (so `headers().get('x-request-id')`
  // works in route handlers / server actions) AND the response
  // headers (so the client can echo it back if needed).
  const res = NextResponse.next({
    request: { headers: withRequestHeaders(req, requestId) },
  });
  res.headers.set("x-request-id", requestId);
  // The ALS scope has to wrap the response-construction path so any
  // log line emitted by downstream middleware (none today, but a
  // hook point for the future) inherits the request id. The
  // `NextResponse.next()` above is the Next-equivalent of
  // `res.write()`; once the request returns, the ALS scope unwinds.
  return runWithRequestContext({ requestId }, () => res);
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
