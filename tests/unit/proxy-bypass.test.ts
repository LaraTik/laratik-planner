/**
 * Locks the public-path bypass list in src/proxy.ts.
 *
 * Why this exists: the proxy used to bypass only the bare path
 * `/api/health`, leaving `/api/health/live` and `/api/health/ready`
 * (used by Docker HEALTHCHECK and Traefik upstream probe) to fall
 * through to the auth check and 307 to /signin. Adding the
 * `pathname.startsWith("/api/health/")` arm to the bypass list is
 * the fix; this test pins the contract so a future refactor can't
 * silently drop the live/ready subpaths.
 *
 * We don't exercise the auth-protected branches here (those would
 * need to mock the getToken + Auth.js call chain). We just verify
 * that the public paths return NextResponse.next() without
 * redirecting. If the proxy ever grows a new "public" path, add
 * an `it` here for it in the same PR.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// serverEnv is read by proxy.ts at module-evaluation time; give it a
// baseline so importing the module doesn't throw.
vi.mock("@/lib/validation/env", () => ({
  serverEnv: {
    AUTH_SECRET: "ci_secret_only_not_for_production_xxxxxxxxxxxxxxxx",
    DATABASE_URL: "postgresql://x:y@localhost:5432/test",
    NODE_ENV: "test",
  },
}));

// proxy.ts uses getToken from next-auth/jwt. The bypass list is
// evaluated BEFORE getToken, so we never reach it on these requests —
// but the import is still required. Stub it to a no-op.
vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn().mockResolvedValue(null),
}));

import { proxy } from "@/proxy";

const PUBLIC_PATHS: ReadonlyArray<{ name: string; pathname: string }> = [
  { name: "Next static assets", pathname: "/_next/static/chunks/main.js" },
  { name: "Next image optimizer", pathname: "/_next/image" },
  { name: "auth.js own endpoints", pathname: "/api/auth/session" },
  { name: "auth.js signin POST", pathname: "/api/auth/callback/credentials" },
  { name: "health (bare alias)", pathname: "/api/health" },
  { name: "health liveness (docker HEALTHCHECK)", pathname: "/api/health/live" },
  { name: "health readiness (Traefik upstream probe)", pathname: "/api/health/ready" },
  { name: "bootstrap status", pathname: "/api/bootstrap/status" },
  { name: "favicon", pathname: "/favicon.ico" },
  { name: "robots.txt", pathname: "/robots.txt" },
];

const PROTECTED_PATHS: ReadonlyArray<{ name: string; pathname: string }> = [
  { name: "app page (auth required)", pathname: "/app" },
  { name: "app sub-route (auth required)", pathname: "/app/projects" },
  { name: "API route (auth required)", pathname: "/api/workspaces" },
  { name: "API route under /api/v1 (auth required)", pathname: "/api/v1/whoami" },
  { name: "signin (handled separately, but should not crash)", pathname: "/signin" },
];

function callProxy(pathname: string) {
  const req = new NextRequest(`http://localhost${pathname}`);
  return proxy(req);
}

describe("proxy bypass — public paths", () => {
  beforeEach(() => vi.restoreAllMocks());

  for (const { name, pathname } of PUBLIC_PATHS) {
    it(`does not redirect ${name} (${pathname})`, async () => {
      const res = await callProxy(pathname);
      // NextResponse.next() returns a 200 with the x-middleware-rewritten
      // header. Anything 3xx means we hit the auth redirect branch.
      expect(res.status).toBe(200);
      // Sanity: no Location header. (NextResponse.redirect sets it.)
      expect(res.headers.get("location")).toBeNull();
    });
  }
});

describe("proxy bypass — protected paths", () => {
  beforeEach(() => vi.restoreAllMocks());

  for (const { name, pathname } of PROTECTED_PATHS) {
    it(`redirects unauthed ${name} (${pathname}) to /signin`, async () => {
      const res = await callProxy(pathname);
      // With getToken returning null, every protected path should
      // 307 to /signin with a callbackUrl. The signin route itself
      // is special-cased and just passes through.
      if (pathname === "/signin") {
        // /signin passes through (200) when unauthenticated; the
        // authed-redirect branch only fires for token-bearing requests.
        expect(res.status).toBe(200);
      } else {
        expect(res.status).toBe(307);
        const location = res.headers.get("location") ?? "";
        expect(location).toMatch(/^.*\/signin\?callbackUrl=/);
        expect(decodeURIComponent(location)).toContain(pathname);
      }
    });
  }
});
