import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Structural guard for src/proxy.ts → NextAuth getToken() call.
 *
 * NextAuth v5 issues the session cookie as `__Secure-authjs.session-token`
 * in production (HTTPS) and as `authjs.session-token` in dev (HTTP). The
 * `getToken()` helper defaults `cookieName` and `salt` to the *non-secure*
 * name when `secureCookie` is not explicitly passed. The previous proxy
 * called `getToken({ ..., salt: "authjs.session-token" })` with no
 * `secureCookie` flag, so on every production request the helper tried
 * to read a cookie that did not exist (the real cookie is the
 * `__Secure-`-prefixed one), returned null, and redirected the user to
 * /signin?callbackUrl=/app after a perfectly successful magic-link
 * sign-in. The user saw a 404/redirect with no error code in the URL —
 * a silent auth failure.
 *
 * Replaces the bug found in production on 2026-08-20:
 *   The first info@laratik.com magic-link sign-in (after the previous
 *   /onboarding fix) landed on /signin?callbackUrl=%2Fapp instead of
 *   /app or /setup. The proxy was reading the wrong cookie name.
 *
 * This test is structural (reads the proxy source as text) so a future
 * refactor that moves the cookie resolution logic forces the author to
 * update this test. The point is to keep the proxy's getToken() call
 * aligned with NextAuth v5's runtime cookie-name resolution.
 */
describe("auth proxy cookie-name resolution", () => {
  const proxyPath = join(process.cwd(), "src", "proxy.ts");
  const proxySource = readFileSync(proxyPath, "utf8");

  it("src/proxy.ts exists and is readable", () => {
    expect(existsSync(proxyPath)).toBe(true);
  });

  it("does not pass a hardcoded non-secure salt to getToken", () => {
    // The previous broken version had: salt: "authjs.session-token"
    // That was a hardcoded non-secure name that silently broke prod auth.
    // getToken() should let salt default to cookieName (which itself is
    // computed from secureCookie + NextAuth's defaultCookies()).
    expect(proxySource).not.toMatch(/salt\s*:\s*["']authjs\.session-token["']/);
  });

  it("does not pass a hardcoded non-secure cookieName to getToken", () => {
    // Same trap as salt — never hardcode the non-secure name. Either
    // let getToken() default it from `secureCookie`, or compute it.
    expect(proxySource).not.toMatch(/cookieName\s*:\s*["']authjs\.session-token["']/);
  });

  it("passes secureCookie to getToken (auto-detected from request)", () => {
    // The fix is to derive secureCookie from the request protocol /
    // X-Forwarded-Proto header and pass it to getToken. Without this,
    // getToken defaults cookieName to the non-secure name on prod.
    // Accept both the explicit `secureCookie: ...` and the shorthand
    // `secureCookie,` property syntax.
    expect(proxySource).toMatch(/secureCookie\s*[:,}\n]/);
  });

  it("detects HTTPS via either req.nextUrl.protocol or x-forwarded-proto", () => {
    // Traefik + Cloudflare sit in front of prod, so the inner request is
    // HTTP but the original protocol is in X-Forwarded-Proto. The
    // detector must look at both.
    expect(proxySource).toMatch(/nextUrl\.protocol|x-forwarded-proto/i);
  });
});
