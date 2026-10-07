import { describe, expect, it } from "vitest";

import {
  appHref,
  isAppSegment,
  legacyToCanonicalHref,
  parseLegacyWorkspacePath,
  parseWorkspacePath,
  workspaceBasePath,
  workspaceHref,
} from "@/lib/urls";

/**
 * Workspace URL contracts.
 *
 * A workspace's identity is `(agencyId, slug)` — the unique index is per-agency,
 * not global. The old URL was `/app/w/[workspaceSlug]`, so a shared link meant
 * "this slug in whichever agency the RECIPIENT currently has active", resolved
 * from the signed cookie. That is the bug these helpers exist to make
 * impossible to reintroduce: every workspace URL must now carry BOTH segments.
 */

describe("workspaceBasePath", () => {
  it("includes the agency so the URL is self-describing", () => {
    expect(workspaceBasePath("acme", "food-game")).toBe("/app/a/acme/w/food-game");
  });

  it("never produces the legacy /app/w/ form", () => {
    // The whole point. If a builder regressed to the cookie-scoped shape, a
    // shared link would silently go back to being ambiguous.
    expect(workspaceBasePath("acme", "food-game")).not.toMatch(/^\/app\/w\//);
  });

  it("distinguishes two agencies that own the same workspace slug", () => {
    // The exact collision that motivated the change: `food-game` exists in both.
    expect(workspaceBasePath("agency-one", "food-game")).not.toBe(
      workspaceBasePath("agency-two", "food-game"),
    );
  });
});

describe("workspaceHref", () => {
  it("builds the workspace root", () => {
    expect(workspaceHref("acme", "food-game")).toBe("/app/a/acme/w/food-game");
  });

  it("appends a single section", () => {
    expect(workspaceHref("acme", "food-game", "planning")).toBe("/app/a/acme/w/food-game/planning");
  });

  it("appends several segments from an array or a joined string", () => {
    expect(workspaceHref("acme", "food-game", ["planning", "batch"])).toBe(
      "/app/a/acme/w/food-game/planning/batch",
    );
    expect(workspaceHref("acme", "food-game", "planning/batch")).toBe(
      "/app/a/acme/w/food-game/planning/batch",
    );
  });

  it("preserves a query string with or without the leading question mark", () => {
    expect(workspaceHref("acme", "food-game", "planning", "?month=2026-11")).toBe(
      "/app/a/acme/w/food-game/planning?month=2026-11",
    );
    expect(workspaceHref("acme", "food-game", "planning", "month=2026-11")).toBe(
      "/app/a/acme/w/food-game/planning?month=2026-11",
    );
  });

  it("collapses stray and duplicated slashes instead of emitting empty segments", () => {
    expect(workspaceHref("acme", "food-game", "/planning//new/")).toBe(
      "/app/a/acme/w/food-game/planning/new",
    );
  });
});

describe("parseWorkspacePath", () => {
  it("round-trips with workspaceHref", () => {
    const href = workspaceHref("acme", "food-game", "planning/new", "?month=2026-11");
    expect(parseWorkspacePath(href)).toEqual({
      agencySlug: "acme",
      workspaceSlug: "food-game",
      rest: "planning/new",
      query: "?month=2026-11",
    });
  });

  it("returns an empty rest and query at the workspace root", () => {
    expect(parseWorkspacePath("/app/a/acme/w/food-game")).toEqual({
      agencySlug: "acme",
      workspaceSlug: "food-game",
      rest: "",
      query: "",
    });
  });

  it("rejects the legacy shape — it has no tenant to recover", () => {
    // Callers must not treat a legacy path as canonical; that is what lets a
    // cookie-scoped resolution creep back in.
    expect(parseWorkspacePath("/app/w/food-game")).toBeNull();
    expect(parseWorkspacePath("/app/w/food-game/planning")).toBeNull();
  });

  it("rejects app-level routes and near-misses", () => {
    expect(parseWorkspacePath("/app/workspaces")).toBeNull();
    expect(parseWorkspacePath("/app/a/acme/w")).toBeNull();
    expect(parseWorkspacePath("/app/a/acme")).toBeNull();
    expect(parseWorkspacePath("/")).toBeNull();
  });
});

describe("parseLegacyWorkspacePath", () => {
  it("recognises the pre-refactor shape", () => {
    expect(parseLegacyWorkspacePath("/app/w/food-game/planning?month=2026-11")).toEqual({
      workspaceSlug: "food-game",
      rest: "planning",
      query: "?month=2026-11",
    });
  });

  it("rejects canonical and unrelated paths", () => {
    expect(parseLegacyWorkspacePath("/app/a/acme/w/food-game")).toBeNull();
    expect(parseLegacyWorkspacePath("/app/workspaces")).toBeNull();
  });
});

describe("legacyToCanonicalHref", () => {
  it("rewrites a shared legacy link into the canonical form, keeping path and query", () => {
    const href = legacyToCanonicalHref("/app/w/food-game/planning?month=2026-11", () => "acme");
    expect(href).toBe("/app/a/acme/w/food-game/planning?month=2026-11");
  });

  it("returns null when the tenant cannot be resolved, so the caller 404s instead of guessing", () => {
    // The whole design: never invent a tenant. A null forces the caller into the
    // "I cannot identify this destination" branch.
    expect(legacyToCanonicalHref("/app/w/food-game", () => null)).toBeNull();
  });

  it("returns null for a non-legacy path", () => {
    expect(legacyToCanonicalHref("/app/workspaces", () => "acme")).toBeNull();
  });

  it("resolves per call site, so one slug can map to different tenants", () => {
    expect(legacyToCanonicalHref("/app/w/food-game", () => "agency-one")).toBe(
      "/app/a/agency-one/w/food-game",
    );
    expect(legacyToCanonicalHref("/app/w/food-game", () => "agency-two")).toBe(
      "/app/a/agency-two/w/food-game",
    );
  });
});

describe("appHref", () => {
  it("builds app-level routes without a tenant", () => {
    expect(appHref("workspaces")).toBe("/app/workspaces");
    expect(appHref("calendar", "2026-11")).toBe("/app/calendar/2026-11");
  });

  it("validates the segment against the known app routes", () => {
    expect(isAppSegment("workspaces")).toBe(true);
    expect(isAppSegment("nope")).toBe(false);
  });
});
