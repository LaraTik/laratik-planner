import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * `laratik_locale` cookie contract:
 *
 *   - Name is `laratik_locale`
 *   - Allowed values are exactly `en` and `ar`
 *   - HttpOnly, SameSite=Lax, Path=/
 *   - Secure only in production
 *   - Max-Age = 365 days
 *   - Whitespace / unknown / null values are read as `null`
 *   - `clearPublicLocale` is idempotent
 *
 * These tests pin the contract so a future "let's add a
 * SameSite=Strict" or "let's drop HttpOnly" change has to
 * make a conscious decision against the ADR.
 */

// ─── env mock (must precede any import that reads serverEnv) ───────────────

vi.mock("@/lib/validation/env", () => ({
  serverEnv: { NODE_ENV: "test" },
  clientEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));

// ─── next/headers cookies() mock ──────────────────────────────────────────

type CookieEntry = {
  name: string;
  value: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
  path?: string;
  maxAge?: number;
};

const cookieStoreMock = vi.hoisted(() => {
  const store: { entries: CookieEntry[]; deletes: string[]; current: Record<string, string> } = {
    entries: [],
    deletes: [],
    current: {},
  };
  const cookiesFn = vi.fn(async () => ({
    set: (entry: CookieEntry) => {
      store.entries.push(entry);
      store.current[entry.name] = entry.value;
    },
    delete: (name: string) => {
      store.deletes.push(name);
      delete store.current[name];
    },
    get: (name: string) => {
      const value = store.current[name];
      return value ? { name, value } : undefined;
    },
  }));
  return { store, cookiesFn };
});

vi.mock("next/headers", () => ({
  cookies: cookieStoreMock.cookiesFn,
}));

const cookie = await import("@/lib/i18n/cookie");

beforeEach(() => {
  cookieStoreMock.store.entries = [];
  cookieStoreMock.store.deletes = [];
  cookieStoreMock.store.current = {};
  cookieStoreMock.cookiesFn.mockClear();
});

describe("i18n/cookie — getPublicLocale", () => {
  it("returns null when the cookie is absent", async () => {
    expect(await cookie.getPublicLocale()).toBeNull();
  });

  it("returns the code for a supported value", async () => {
    cookieStoreMock.store.current["laratik_locale"] = "ar";
    expect(await cookie.getPublicLocale()).toBe("ar");
  });

  it("returns null for an unknown code (defensive against tampering)", async () => {
    cookieStoreMock.store.current["laratik_locale"] = "pt-BR";
    expect(await cookie.getPublicLocale()).toBeNull();
  });

  it("returns null for an empty or whitespace value", async () => {
    cookieStoreMock.store.current["laratik_locale"] = "   ";
    expect(await cookie.getPublicLocale()).toBeNull();
  });
});

describe("i18n/cookie — setPublicLocale", () => {
  it("writes a cookie with the locked attributes", async () => {
    const ok = await cookie.setPublicLocale("ar");
    expect(ok).toBe(true);
    const entry = cookieStoreMock.store.entries.at(-1);
    expect(entry).toMatchObject({
      name: "laratik_locale",
      value: "ar",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    // 365 days, in seconds.
    expect(entry?.maxAge).toBe(365 * 24 * 60 * 60);
    // Secure is false in test (NODE_ENV=test).
    expect(entry?.secure).toBe(false);
  });

  it("refuses unsupported codes without writing a cookie", async () => {
    const ok = await cookie.setPublicLocale("fr-FR");
    expect(ok).toBe(false);
    expect(cookieStoreMock.store.entries).toHaveLength(0);
  });
});

describe("i18n/cookie — clearPublicLocale", () => {
  it("is idempotent and writes a delete entry", async () => {
    await cookie.clearPublicLocale();
    await cookie.clearPublicLocale();
    expect(cookieStoreMock.store.deletes.filter((n) => n === "laratik_locale")).toHaveLength(2);
  });
});
