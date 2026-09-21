import { describe, expect, it } from "vitest";
import {
  ALLOWED_PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  buildListHref,
  hasActiveFilters,
  normaliseSearchParams,
  paginate,
  parseListFilters,
  parsePage,
  parsePageSize,
} from "@/lib/list-page-utils";

/**
 * Team & Access / ui-ux-pro-max — list URL helper contract.
 *
 * These helpers are the single source of truth for what search/filter
 * state the three admin lists (Platform access / Agency members /
 * Workspace team) understand. If this contract drifts, the three
 * pages will start disagreeing on convention (the bug we already
 * caught once). Tests pin every behaviour the pages depend on.
 *
 * Tests are grouped so a future contributor can read the spec top to
 * bottom and walk away with the model in their head. No DB, no Drizzle
 * — these helpers are pure functions on `URLSearchParams`-shaped
 * objects. Keep it that way; the day someone adds DB-bound logic to
 * this file, they have refactored the wrong thing.
 */

describe("parsePage", () => {
  it("returns 1 for missing, empty, and non-numeric input", () => {
    for (const raw of [undefined, null, "", "abc", "0"]) {
      expect(parsePage(raw)).toBe(1);
    }
  });
  it("clamps negative numbers to 1", () => {
    expect(parsePage("-3")).toBe(1);
  });
  it("parses positive integers as-is", () => {
    expect(parsePage("1")).toBe(1);
    expect(parsePage("9")).toBe(9);
    expect(parsePage("100")).toBe(100);
  });
  it("ignores fractions — returns the integer floor", () => {
    expect(parsePage("2.9")).toBe(2);
  });
});

describe("parsePageSize", () => {
  it("returns DEFAULT_PAGE_SIZE for missing or empty input", () => {
    expect(parsePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("")).toBe(DEFAULT_PAGE_SIZE);
  });
  it("accepts only the canonical sizes; everything else falls back to DEFAULT_PAGE_SIZE", () => {
    for (const allowed of ALLOWED_PAGE_SIZES) {
      expect(parsePageSize(String(allowed))).toBe(allowed);
    }
    expect(parsePageSize("10")).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("1000")).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("foo")).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe("normaliseSearchParams", () => {
  it("passes Next.js searchParams straight through to URLSearchParams", () => {
    const out = normaliseSearchParams({ q: "alice", role: ["designer", "viewer"] });
    expect(out.get("q")).toBe("alice");
    expect(out.getAll("role")).toEqual(["designer", "viewer"]);
  });
  it("strips undefined / null / empty values to keep URLs clean", () => {
    const out = normaliseSearchParams({
      q: "",
      role: undefined,
      status: undefined,
      page: "1",
    });
    expect(out.has("q")).toBe(false);
    expect(out.has("role")).toBe(false);
    expect(out.has("status")).toBe(false);
    expect(out.get("page")).toBe("1");
  });
});

describe("parseListFilters", () => {
  it("returns a fully-populated ListFilters object from a raw searchParams", () => {
    const filters = parseListFilters({
      q: "  Ali  ",
      status: ["Active", "PENDING"],
      role: ["designer"],
      page: "3",
      size: "25",
    });
    expect(filters.q).toBe("Ali");
    expect(filters.status).toEqual(["active", "pending"]);
    expect(filters.role).toEqual(["designer"]);
    expect(filters.page).toBe(3);
    expect(filters.size).toBe(25);
  });
  it("clamps and de-duplicates multi-value params", () => {
    const filters = parseListFilters({
      status: ["active", "ACTIVE", "pending", "pending"],
    });
    expect(filters.status).toEqual(["active", "pending"]);
  });
  it("truncates the search query to 200 characters to keep URLs sane", () => {
    const long = "x".repeat(250);
    const filters = parseListFilters({ q: long });
    expect(filters.q.length).toBe(200);
  });
  it("returns empty defaults when given an empty object", () => {
    const filters = parseListFilters({});
    expect(filters).toEqual({
      q: "",
      status: [],
      role: [],
      page: 1,
      size: DEFAULT_PAGE_SIZE,
    });
  });
});

describe("buildListHref", () => {
  const base = "/app/users";

  it("omits the query string entirely when no filter is active (canonical /the/list)", () => {
    const filters = {
      q: "",
      status: [] as string[],
      role: [] as string[],
      size: DEFAULT_PAGE_SIZE,
    };
    expect(buildListHref({ basePath: base, current: filters })).toBe(base);
  });
  it("encodes a search query under ?q=", () => {
    const href = buildListHref({
      basePath: base,
      current: { q: "", status: [], role: [], size: DEFAULT_PAGE_SIZE },
      next: { q: "alice" },
    });
    expect(href).toBe(`${base}?q=alice`);
  });
  it("includes the role param only when role.length > 0", () => {
    const href = buildListHref({
      basePath: base,
      current: { q: "", status: [], role: ["designer"], size: DEFAULT_PAGE_SIZE },
    });
    expect(href).toBe(`${base}?role=designer`);
  });
  it("preserves the current filter state when only `page` changes", () => {
    const current = {
      q: "alice",
      status: ["active"],
      role: ["designer"],
      size: 50 as const,
    };
    const href = buildListHref({ basePath: base, current, next: { page: 2 } });
    expect(href).toBe(`${base}?q=alice&status=active&role=designer&page=2`);
  });
  it("treats empty `next.status`/`next.role` as a chip clear (not a no-op)", () => {
    const current = {
      q: "",
      status: ["active", "pending"],
      role: ["designer"],
      size: 50 as const,
    };
    const href = buildListHref({
      basePath: base,
      current,
      next: { status: [], role: [] },
    });
    expect(href).toBe(base); // all foreign keys gone; fall back to canonical
  });
  it("omits `page=1` (it's the default)", () => {
    const filters = {
      q: "",
      status: [] as string[],
      role: [] as string[],
      size: DEFAULT_PAGE_SIZE,
    };
    expect(buildListHref({ basePath: base, current: filters, next: { page: 1 } })).toBe(base);
  });
  it("includes `size` only when not DEFAULT_PAGE_SIZE", () => {
    const filters = {
      q: "",
      status: [] as string[],
      role: [] as string[],
      size: DEFAULT_PAGE_SIZE,
    };
    expect(buildListHref({ basePath: base, current: filters, next: { size: 25 as const } })).toBe(
      `${base}?size=25`,
    );
  });
});

describe("hasActiveFilters", () => {
  it("returns false for a fully-default filter set", () => {
    expect(
      hasActiveFilters({
        q: "",
        status: [],
        role: [],
        page: 1,
        size: DEFAULT_PAGE_SIZE,
      }),
    ).toBe(false);
  });
  it("returns true when any field is non-default", () => {
    expect(hasActiveFilters({ q: "a", status: [], role: [], page: 1, size: 50 as const })).toBe(
      true,
    );
    expect(hasActiveFilters({ q: "", status: [], role: ["d"], page: 1, size: 50 as const })).toBe(
      true,
    );
    expect(hasActiveFilters({ q: "", status: [], role: [], page: 2, size: 50 as const })).toBe(
      false,
    );
    // size is present but unequal to DEFAULT
    expect(hasActiveFilters({ q: "", status: [], role: [], page: 1, size: 25 })).toBe(true);
  });
});

describe("paginate", () => {
  const rows = Array.from({ length: 137 }, (_, i) => i + 1);

  it("returns the canonical empty state when total is zero", () => {
    const out = paginate([], 1, 25);
    expect(out).toEqual({
      rows: [],
      total: 0,
      matched: 0,
      from: 0,
      to: 0,
      page: 1,
      totalPages: 1,
    });
  });
  it("computes range, totalPages, and clamped page for the last page", () => {
    const out = paginate(rows, 3, 50);
    expect(out.total).toBe(137);
    expect(out.totalPages).toBe(3);
    expect(out.from).toBe(101);
    expect(out.to).toBe(137);
    expect(out.rows.length).toBe(37);
    expect(out.page).toBe(3);
  });
  it("clamps the requested page to the totalPages ceiling (no overflow)", () => {
    const out = paginate(rows, 99, 50);
    expect(out.page).toBe(3);
    expect(out.from).toBe(101);
    expect(out.to).toBe(137);
  });
  it("round-trips identical content for `rows` across every page", () => {
    const seen = new Set<number>();
    for (let p = 1; p <= 3; p++) {
      const out = paginate(rows, p, 50);
      for (const r of out.rows) seen.add(r);
    }
    expect(seen.size).toBe(137);
  });
});
