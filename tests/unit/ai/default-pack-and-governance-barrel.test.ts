import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The canonical planning pack and the AI governance barrel.
 *
 * `default-planning-pack.ts` is the single source of truth every planning
 * prompt embeds, and `governance-index.ts` is the public surface the generate
 * route and the platform console both import. Neither has logic of its own,
 * so what these tests protect is the *shape and the binding identity* — a
 * silent drift in either is invisible until a plan is generated against a
 * manifest nobody validated.
 */

const dbMock = vi.hoisted(() => ({ db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() } }));
const entitlementsMock = vi.hoisted(() => ({
  getEffectiveEntitlement: vi.fn(),
  reserveCapacity: vi.fn(),
  LimitExceededError: class LimitExceededError extends Error {},
}));
const usageMock = vi.hoisted(() => ({ recordUsage: vi.fn() }));

vi.mock("@/lib/db", () => dbMock);
vi.mock("@/lib/entitlements", () => entitlementsMock);
vi.mock("@/lib/usage", () => usageMock);

import { CANONICAL_PLANNING_PACK } from "@/lib/ai/default-planning-pack";
import { PlanningInstructionPackManifestSchema } from "@/lib/ai/planning-contract";
import * as barrel from "@/lib/ai/governance-index";
import * as governance from "@/lib/ai/governance";
import canonicalManifest from "../../../docs/ai-planning/defaults/manifest.json";

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.db.select.mockReset();
  dbMock.db.insert.mockReset();
  dbMock.db.update.mockReset();
  entitlementsMock.getEffectiveEntitlement.mockReset();
  entitlementsMock.reserveCapacity.mockReset();
  usageMock.recordUsage.mockReset();
});

describe("CANONICAL_PLANNING_PACK", () => {
  it("carries a manifest that validates against the current contract", () => {
    // The value is produced by `.parse` at module load, so a contract change
    // that the checked-in manifest does not satisfy fails the whole import.
    // Assert the invariant explicitly so the failure is legible.
    expect(() =>
      PlanningInstructionPackManifestSchema.parse(CANONICAL_PLANNING_PACK.manifest),
    ).not.toThrow();
    expect(CANONICAL_PLANNING_PACK.manifest).toEqual(
      PlanningInstructionPackManifestSchema.parse(canonicalManifest),
    );
  });

  it("states the precedence order the planner prompt relies on", () => {
    // The prompt inlines this string verbatim; reordering it silently changes
    // which instruction wins for overlapping guidance.
    expect(CANONICAL_PLANNING_PACK.precedence).toBe(
      "canonical → agency published → workspace published → monthly overrides",
    );
  });

  it("carries a source summary that is non-empty and single-paragraph", () => {
    // An empty summary would still satisfy the type but leave the planner with
    // no editorial guidance beyond the manifest.
    expect(CANONICAL_PLANNING_PACK.sourceSummary.length).toBeGreaterThan(100);
    expect(CANONICAL_PLANNING_PACK.sourceSummary).not.toContain("\n\n");
  });

  it("is JSON-serialisable so it can be embedded in a prompt string", () => {
    // The prompt does JSON.stringify(manifest) — a circular or non-serialisable
    // value would throw inside prompt assembly, at request time.
    expect(() => JSON.stringify(CANONICAL_PLANNING_PACK)).not.toThrow();
    expect(JSON.parse(JSON.stringify(CANONICAL_PLANNING_PACK)).manifest).toEqual(
      CANONICAL_PLANNING_PACK.manifest,
    );
  });
});

describe("AI governance barrel", () => {
  it("re-exports exactly the documented public surface", () => {
    expect(Object.keys(barrel).sort()).toEqual([
      "AiBudgetReservationSchema",
      "enforceAiBudget",
      "getUserDailyBudgetSnapshot",
      "loadEnabledCapabilities",
      "reconcileAiBudget",
      "resolveEnabledCapabilities",
    ]);
  });

  it("re-exports the same function bindings as ./governance, not copies", () => {
    // Consumers import the barrel. If the barrel ever re-bound or wrapped an
    // export, a governance fix in ./governance would silently miss callers.
    for (const name of [
      "resolveEnabledCapabilities",
      "loadEnabledCapabilities",
      "enforceAiBudget",
      "reconcileAiBudget",
      "getUserDailyBudgetSnapshot",
    ] as const) {
      expect(barrel[name]).toBe(governance[name]);
    }
    expect(barrel.AiBudgetReservationSchema).toBe(governance.AiBudgetReservationSchema);
  });
});
