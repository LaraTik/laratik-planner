import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * @regression-guard  — REGRESSION GUARD, not a behaviour test.
 *
 * TEST-13 (GAP-FULL-REVIEW-2026-08-25): the assertions below read
 * `src/lib/auth/config.ts` as a string and regex-match the
 * `pages.<name>` values. This is intentionally a brittle source-
 * shape guard, not a behaviour test — see the audit note for why
 * the brittleness is the point.
 *
 * Structural guard for src/lib/auth/config.ts → src/app/ routing.
 *
 * NextAuth v5 honors a `pages` map that points at our own Next.js routes
 * (signIn, error, verifyRequest, newUser, etc.). If any of those paths is
 * set but does not exist in src/app/, NextAuth will redirect users to a
 * 404 the first time they need it. This is silent in CI because no e2e
 * test exercises the magic-link sign-in of a brand-new user end-to-end,
 * so the only way to catch the drift is a structural check.
 *
 * Replaces the bug found in production on 2026-08-20:
 *   pages.newUser = "/onboarding" but src/app/onboarding/page.tsx did not
 *   exist. The first magic-link sign-in of info@laratik.com landed on a
 *   404 with `Back to My Work`. Fix: pages.newUser = "/setup" (the actual
 *   first-time-admin bootstrap page; /setup itself redirects to /app
 *   once an agency exists, so this is also safe for invited users).
 *
 * If you are refactoring `src/lib/auth/config.ts` and this test
 * fails: update BOTH the config AND the regex below. The test is
 * the contract; the source must follow. Do not "fix" the test by
 * loosening the regex — that erases the regression guard.
 */
describe("auth config pages map routes that exist", () => {
  // We import the config via a tiny shim that strips the side effects
  // (NextAuth() call) so this test stays a pure structural check and does
  // not require a database connection or a real AUTH_SECRET.
  //
  // The shim is necessary because the config module calls NextAuth() at
  // import time, which immediately touches the Drizzle adapter and the
  // validation env. We avoid that with a module reset.
  const appRoot = join(process.cwd(), "src", "app");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");

  function pageExists(routePath: string): boolean {
    if (!routePath.startsWith("/")) return false;
    const segments = routePath.split("/").filter(Boolean);
    const candidate = join(appRoot, ...segments, "page.tsx");
    return existsSync(candidate);
  }

  // Resolve the config from the source file as a string and pull out
  // the `pages` block with a regex. This is intentionally fragile so a
  // future refactor that moves the config forces the author to update
  // this test — the point of the test is to keep this file linked to
  // the live auth config, not to make the config editor-friendly.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  const configSource = fs.readFileSync(
    path.join(process.cwd(), "src", "lib", "auth", "config.ts"),
    "utf8",
  );

  function readPageRoute(name: string): string | null {
    // Match:  name: "/some/route",  inside the `pages: { ... }` block.
    const re = new RegExp(String.raw`\b${name}\s*:\s*["']([^"']+)["']`);
    const match = configSource.match(re);
    return match && match[1] ? match[1] : null;
  }

  it("pages.newUser is set and points at an existing src/app/<route>/page.tsx", () => {
    const newUser = readPageRoute("newUser");
    expect(newUser, "pages.newUser must be set in auth config").not.toBeNull();
    expect(newUser, "pages.newUser must be a same-origin path").toMatch(/^\/[a-z0-9/_-]*$/i);
    expect(
      pageExists(newUser as string),
      `pages.newUser points at "${newUser}" but ${newUser}/page.tsx does not exist. ` +
        "NextAuth will 404 the first sign-in of every new user.",
    ).toBe(true);
  });

  it("pages.signIn points at an existing route", () => {
    const signIn = readPageRoute("signIn");
    expect(signIn).not.toBeNull();
    expect(pageExists(signIn as string)).toBe(true);
  });

  it("pages.error points at an existing route", () => {
    const errorPage = readPageRoute("error");
    expect(errorPage).not.toBeNull();
    expect(pageExists(errorPage as string)).toBe(true);
  });

  it("pages.verifyRequest points at an existing route", () => {
    const verifyRequest = readPageRoute("verifyRequest");
    expect(verifyRequest).not.toBeNull();
    expect(pageExists(verifyRequest as string)).toBe(true);
  });
});
