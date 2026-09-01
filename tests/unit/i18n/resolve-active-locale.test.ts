import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * `resolveActiveLocale` precedence:
 *
 *   1. Authenticated user's `users.locale` (validated)
 *   2. Public `laratik_locale` cookie (validated)
 *   3. English fallback
 *
 * The agency locale is NOT part of the interface chain
 * (it is the *content* default, exercised by
 * `resolveContentLocale`). This test pins the separation
 * so a future "the agency locale should also be a UI
 * fallback" change has to make a conscious decision.
 *
 * The test also pins the `source` discriminator so
 * observability can tell which level produced the answer.
 */

// ─── env mock ──────────────────────────────────────────────────────────────

vi.mock("@/lib/validation/env", () => ({
  serverEnv: { NODE_ENV: "test" },
  clientEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));

// ─── auth / actor mock ─────────────────────────────────────────────────────

const authMock = vi.hoisted(() => ({
  current: { user: null as { id: string } | null },
}));

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(async () => authMock.current.user),
}));

vi.mock("@/lib/auth/current-actor", () => ({
  currentActor: vi.fn(async () =>
    authMock.current.user ? { id: authMock.current.user.id } : null,
  ),
}));

// ─── drizzle chain mock (only the `users` lookup is exercised) ─────────────

type LimitResult = Array<Record<string, unknown> | undefined>;

const dbMock = vi.hoisted(() => {
  const state: { limitResults: LimitResult[] } = { limitResults: [] };
  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(() => {
      const next = state.limitResults.shift() ?? [];
      return Promise.resolve(next);
    });
    return chain;
  });
  return { select, state };
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

// ─── cookie mock ───────────────────────────────────────────────────────────

const cookieMock = vi.hoisted(() => {
  // Mirrors the real `getPublicLocale`: a value that is
  // not a supported code is read as `null` (defensive
  // against a tampered / legacy cookie). The mock filters
  // the same way the production helper does, so the
  // resolver never sees an invalid `fromCookie`.
  const SUPPORTED = new Set(["en", "ar"]);
  const state: { public: string | null } = { public: null };
  return {
    state,
    getPublicLocale: vi.fn(async () =>
      state.public && SUPPORTED.has(state.public) ? state.public : null,
    ),
  };
});

vi.mock("@/lib/i18n/cookie", () => cookieMock);

// ─── SUT import (after all mocks) ──────────────────────────────────────────

const resolver = await import("@/lib/i18n/resolve-active-locale");

beforeEach(() => {
  authMock.current.user = null;
  dbMock.state.limitResults = [];
  dbMock.select.mockClear();
  cookieMock.state.public = null;
  cookieMock.getPublicLocale.mockClear();
});

describe("resolveActiveLocale", () => {
  it("returns the user's locale when the user is signed in", async () => {
    authMock.current.user = { id: "u-1" };
    dbMock.state.limitResults = [[{ locale: "ar" }]];
    const r = await resolver.resolveActiveLocale();
    expect(r.code).toBe("ar");
    expect(r.dir).toBe("rtl");
    expect(r.source).toBe("user");
  });

  it("falls back to the cookie when the user is signed in but has no row / null locale", async () => {
    authMock.current.user = { id: "u-1" };
    dbMock.state.limitResults = [[undefined]]; // user not found
    cookieMock.state.public = "ar";
    const r = await resolver.resolveActiveLocale();
    expect(r.code).toBe("ar");
    expect(r.source).toBe("cookie");
  });

  it("falls back to the cookie when the user is signed in but stores a legacy unsupported code", async () => {
    authMock.current.user = { id: "u-1" };
    dbMock.state.limitResults = [[{ locale: "pt-BR" }]];
    cookieMock.state.public = "en";
    const r = await resolver.resolveActiveLocale();
    expect(r.code).toBe("en");
    expect(r.source).toBe("cookie");
  });

  it("returns the cookie when the user is not signed in", async () => {
    cookieMock.state.public = "ar";
    const r = await resolver.resolveActiveLocale();
    expect(r.code).toBe("ar");
    expect(r.source).toBe("cookie");
  });

  it("returns English when nothing is set", async () => {
    const r = await resolver.resolveActiveLocale();
    expect(r.code).toBe("en");
    expect(r.dir).toBe("ltr");
    expect(r.source).toBe("fallback");
  });

  it("profile wins over a conflicting public cookie (locked precedence)", async () => {
    authMock.current.user = { id: "u-1" };
    dbMock.state.limitResults = [[{ locale: "en" }]];
    cookieMock.state.public = "ar"; // conflict — profile must win
    const r = await resolver.resolveActiveLocale();
    expect(r.code).toBe("en");
    expect(r.source).toBe("user");
  });

  it("ignores an invalid cookie value (defensive)", async () => {
    cookieMock.state.public = "fr";
    const r = await resolver.resolveActiveLocale();
    expect(r.code).toBe("en");
    expect(r.source).toBe("fallback");
  });
});
