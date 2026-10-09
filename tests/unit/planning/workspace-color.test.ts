import { describe, expect, it } from "vitest";
import {
  assignWorkspaceSeries,
  compareWorkspaces,
  WORKSPACE_SERIES_SLOTS,
  workspaceSeriesSlot,
  workspaceSeriesVar,
} from "@/lib/planning/workspace-color";

/**
 * Workspace colour assignment.
 *
 * The contract these tests protect is not "returns a colour" — it is
 * that two workspaces an admin can see at the SAME TIME never silently
 * share a hue while a third palette slot sits unused, and that the same
 * agency always produces the same colours. A hash-based per-event
 * implementation would pass a naive "is it defined?" test and fail the
 * collision test below, which is the bug that actually matters here.
 */
const agency = [
  { id: "w-1", name: "Acme" },
  { id: "w-2", name: "Brightwell" },
  { id: "w-3", name: "Cobalt" },
];

describe("workspaceSeriesVar", () => {
  it("maps slots 0..5 onto the design system's chart-series tokens", () => {
    expect(workspaceSeriesVar(0)).toBe("var(--chart-series-1)");
    expect(workspaceSeriesVar(5)).toBe("var(--chart-series-6)");
  });

  it("wraps out-of-range and negative slots instead of emitting an undefined token", () => {
    // A missing token silently renders the element with no background,
    // which looks identical to "this card has no workspace".
    expect(workspaceSeriesVar(6)).toBe("var(--chart-series-1)");
    expect(workspaceSeriesVar(12)).toBe("var(--chart-series-1)");
    expect(workspaceSeriesVar(-1)).toBe("var(--chart-series-6)");
  });

  it("never emits a token outside the declared palette", () => {
    for (let slot = -3; slot <= 12; slot += 1) {
      const match = /var\(--chart-series-(\d)\)/.exec(workspaceSeriesVar(slot));
      expect(match).not.toBeNull();
      const index = Number(match?.[1]);
      expect(index).toBeGreaterThanOrEqual(1);
      expect(index).toBeLessThanOrEqual(WORKSPACE_SERIES_SLOTS);
    }
  });
});

describe("assignWorkspaceSeries", () => {
  it("gives every workspace in a small agency a DIFFERENT slot", () => {
    const slots = assignWorkspaceSeries(agency);
    const assigned = agency.map((workspace) => slots.get(workspace.id));
    expect(new Set(assigned).size).toBe(agency.length);
  });

  it("is stable across calls and independent of input order", () => {
    const forward = assignWorkspaceSeries(agency);
    const reversed = assignWorkspaceSeries([agency[2]!, agency[1]!, agency[0]!]);
    for (const workspace of agency) {
      expect(reversed.get(workspace.id)).toBe(forward.get(workspace.id));
    }
  });

  it("is independent of input order in the ASSIGNMENT itself (sorted by name)", () => {
    const shuffled = [agency[2]!, agency[0]!, agency[1]!];
    const slots = assignWorkspaceSeries(shuffled);
    // Acme sorts first alphabetically → slot 0, regardless of position.
    expect(slots.get("w-1")).toBe(0);
    expect(slots.get("w-2")).toBe(1);
    expect(slots.get("w-3")).toBe(2);
  });

  it("is case-insensitive so Acme and acme cannot swap colours", () => {
    const slots = assignWorkspaceSeries([
      { id: "w-1", name: "acme" },
      { id: "w-2", name: "Brightwell" },
    ]);
    // Lowercased: acme < brightwell → acme is first.
    expect(slots.get("w-1")).toBe(0);
  });

  it("keeps two workspaces with the SAME name distinct via the id tie-breaker", () => {
    const slots = assignWorkspaceSeries([
      { id: "w-b", name: "Twin" },
      { id: "w-a", name: "Twin" },
    ]);
    expect(slots.get("w-a")).not.toBe(slots.get("w-b"));
  });

  it("cycles the palette rather than crashing past six workspaces", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      id: `w-${index}`,
      name: `Client ${index}`,
    }));
    const slots = assignWorkspaceSeries(many);
    expect(slots.size).toBe(9);
    for (const slot of slots.values()) {
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(WORKSPACE_SERIES_SLOTS);
    }
  });

  it("returns an empty map for an empty agency", () => {
    expect(assignWorkspaceSeries([]).size).toBe(0);
  });

  it("does not mutate the caller's array", () => {
    const input = [...agency];
    assignWorkspaceSeries(input);
    expect(input.map((workspace) => workspace.id)).toEqual(["w-1", "w-2", "w-3"]);
  });
});

describe("compareWorkspaces", () => {
  it("is a total order (never returns 0 for different workspaces)", () => {
    // A comparator that returns 0 for two distinct workspaces would make
    // the sort engine's tie-breaking — and therefore the colours —
    // depend on the input array order.
    expect(compareWorkspaces({ id: "a", name: "Same" }, { id: "b", name: "Same" })).not.toBe(0);
  });
});

describe("workspaceSeriesSlot", () => {
  const slots = assignWorkspaceSeries(agency);

  it("returns the assigned slot for a known workspace", () => {
    expect(workspaceSeriesSlot(slots, "w-2")).toBe(1);
  });

  it("returns null for an unknown workspace instead of defaulting to slot 0", () => {
    // Defaulting would paint an archived/unknown workspace's card in the
    // exact colour of the first workspace — a wrong attribution that
    // reads as correct.
    expect(workspaceSeriesSlot(slots, "w-unknown")).toBeNull();
  });

  it("returns null for a null/undefined/empty workspace id", () => {
    expect(workspaceSeriesSlot(slots, null)).toBeNull();
    expect(workspaceSeriesSlot(slots, undefined)).toBeNull();
    expect(workspaceSeriesSlot(slots, "")).toBeNull();
  });
});
