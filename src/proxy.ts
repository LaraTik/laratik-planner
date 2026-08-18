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
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Static assets + Next internals — pass through
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: serverEnv.AUTH_SECRET,
    salt: "authjs.session-token",
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
