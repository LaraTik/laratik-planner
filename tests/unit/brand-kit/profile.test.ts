import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * `getBrandProfile` is the BrandKit overview's single source of truth for
 * the saved brand profile shape. It reads a `jsonb` column whose schema
 * has evolved over time (e.g. `goals: Csv`, `primaryLanguage: enum`,
 * `color_role`). A non-defensive `.parse()` here used to 500 the
 * `/app/w/[slug]/brand-kit` overview for any workspace whose row was
 * written by an older app version — the page-level error boundary caught
 * it but produced a generic "Try again" with no recovery path.
 *
 * These tests pin the new defensive contract:
 *   - null row → `null`
 *   - valid stored profile → parsed shape (passthrough)
 *   - malformed stored profile → empty defaults at the saved revision
 *     (page still renders; form can re-save to overwrite the bad row)
 *   - malformed payload does NOT throw
 */

const dbMock = vi.hoisted(() => {
  function makeChain(rows: unknown[]): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(rows));
    chain.then = (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve);
    return chain;
  }
  return {
    select: vi.fn(() => makeChain([])),
    _setRows: (rows: unknown[]) => {
      dbMock.select.mockImplementation(() => makeChain(rows));
    },
  };
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

// Import after the mock so the module captures the mock at load time.
async function loadProfileModule() {
  return await import("@/lib/brand/profile");
}

beforeEach(() => {
  dbMock.select.mockReset();
  dbMock._setRows([]);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getBrandProfile", () => {
  it("returns null when no row exists for the workspace", async () => {
    dbMock._setRows([]);
    const { getBrandProfile } = await loadProfileModule();
    await expect(getBrandProfile("ws-empty")).resolves.toBeNull();
  });

  it("returns the parsed profile when stored data matches the current schema", async () => {
    dbMock._setRows([
      {
        profile: {
          businessName: "Acme Studios",
          industry: "Photography",
          primaryLanguage: "en",
          goals: ["Grow followers", "Launch course"],
          voiceTone: ["Warm"],
        },
        revision: 7,
      },
    ]);
    const { getBrandProfile } = await loadProfileModule();
    const result = await getBrandProfile("ws-acme");
    expect(result).not.toBeNull();
    expect(result?.revision).toBe(7);
    expect(result?.profile.businessName).toBe("Acme Studios");
    expect(result?.profile.goals).toEqual(["Grow followers", "Launch course"]);
  });

  it("returns the parsed profile when the stored row is null and falls back to defaults", async () => {
    dbMock._setRows([{ profile: null, revision: 1 }]);
    const { getBrandProfile } = await loadProfileModule();
    const result = await getBrandProfile("ws-empty-profile");
    expect(result).not.toBeNull();
    expect(result?.revision).toBe(1);
    // Every defaulted field should be present with the schema default.
    expect(result?.profile.businessName).toBe("");
    expect(result?.profile.goals).toEqual([]);
  });

  it("does NOT throw when stored profile has fields the current schema no longer accepts", async () => {
    // Simulates a row written by an older app version that used a string
    // for `goals`, a non-enum value for `primaryLanguage`, and an extra
    // `legacyField`. With the previous `.parse()` this row 500'd the
    // Brand Kit overview; the new implementation logs + falls back.
    dbMock._setRows([
      {
        profile: {
          businessName: "Acme Studios",
          goals: "Grow followers", // OLD shape: string instead of string[]
          primaryLanguage: "fr", // OLD shape: not in current enum
          secondaryLanguage: "es", // OLD shape: same
          legacyField: "should-be-stripped",
        },
        revision: 12,
      },
    ]);
    const { getBrandProfile } = await loadProfileModule();
    // Invoke once and assert on the resolved value directly. The
    // promise must resolve (no throw) and fall back to defaults at
    // the saved revision so the page can render and the form can
    // re-save fresh data.
    const result = await getBrandProfile("ws-stale");
    expect(result).not.toBeNull();
    expect(result?.revision).toBe(12);
    expect(result?.profile.businessName).toBe("");
    expect(result?.profile.goals).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it("does NOT throw when the stored profile is a primitive (string/number/array)", async () => {
    dbMock._setRows([{ profile: "totally not a profile object", revision: 3 }]);
    const { getBrandProfile } = await loadProfileModule();
    await expect(getBrandProfile("ws-primitive")).resolves.not.toThrow();
    const result = await getBrandProfile("ws-primitive");
    expect(result).not.toBeNull();
    expect(result?.revision).toBe(3);
    expect(result?.profile.businessName).toBe("");
  });
});
