import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * `setPublicLocaleAction` contract:
 *
 *   - Refuses an unsupported locale
 *   - Refuses a return path that is not a same-origin relative URL
 *     (no `//evil.com`, no CRLF, no backslash, no scheme)
 *   - On success, sets the cookie and calls
 *     `revalidatePath(returnTo, "layout")` exactly once
 */

// ─── env mock ──────────────────────────────────────────────────────────────

vi.mock("@/lib/validation/env", () => ({
  serverEnv: { NODE_ENV: "test" },
  clientEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));

// ─── revalidatePath mock ───────────────────────────────────────────────────

const revalidateMock = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

// ─── next/headers cookies() mock ──────────────────────────────────────────

const cookieStoreMock = vi.hoisted(() => {
  const store: {
    entries: Array<{ name: string; value: string }>;
    current: Record<string, string>;
  } = { entries: [], current: {} };
  const cookiesFn = vi.fn(async () => ({
    set: (entry: { name: string; value: string }) => {
      store.entries.push(entry);
      store.current[entry.name] = entry.value;
    },
    delete: (name: string) => {
      delete store.current[name];
    },
  }));
  return { store, cookiesFn };
});

vi.mock("next/headers", () => ({ cookies: cookieStoreMock.cookiesFn }));

const actions = await import("@/app/(landing)/public-locale-actions");

beforeEach(() => {
  cookieStoreMock.store.entries = [];
  cookieStoreMock.store.current = {};
  cookieStoreMock.cookiesFn.mockClear();
  revalidateMock.mockClear();
});

describe("setPublicLocaleAction", () => {
  it("refuses an unsupported locale", async () => {
    const r = await actions.setPublicLocaleAction({
      locale: "fr",
      returnTo: "/",
    });
    expect(r).toEqual({ ok: false, reason: "invalid" });
    expect(cookieStoreMock.store.entries).toHaveLength(0);
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it.each([
    ["//evil.com/x"],
    ["https://evil.com/x"],
    ["/path\r\nSet-Cookie: x=y"],
    ["/path\\evil"],
    [""],
    ["relative/path"],
  ])("rejects a malicious return path: %s", async (bad) => {
    const r = await actions.setPublicLocaleAction({
      locale: "ar",
      returnTo: bad,
    });
    expect(r).toEqual({ ok: false, reason: "return_path" });
    expect(cookieStoreMock.store.entries).toHaveLength(0);
  });

  it("writes the cookie and revalidates on a valid request", async () => {
    const r = await actions.setPublicLocaleAction({
      locale: "ar",
      returnTo: "/signin?callbackUrl=%2Fapp",
    });
    expect(r).toEqual({ ok: true, locale: "ar" });
    expect(cookieStoreMock.store.entries).toMatchObject([{ name: "laratik_locale", value: "ar" }]);
    expect(revalidateMock).toHaveBeenCalledWith("/signin?callbackUrl=%2Fapp", "layout");
  });
});
