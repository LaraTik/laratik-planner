import { describe, expect, it } from "vitest";
import {
  priorityBadgeVariant,
  taskStatusBadgeVariant,
} from "@/components/workspace/status-badge-variants";

/**
 * taskStatusBadgeVariant / priorityBadgeVariant — single source of truth
 * for the colour swatches the unified `CalendarEventCard` consumes
 * when rendering a task-kind event on the agency-overview calendar.
 *
 * The mapping MUST stay in lock-step with the visual styling used
 * elsewhere on the tasks surfaces (the status colour in
 * `task-status-badge.tsx`, the priority colour on the task list) —
 * the tests below pin each enum value to the expected swatch so a
 * future refactor can't silently desync the global calendar.
 */

describe("taskStatusBadgeVariant", () => {
  it("maps `done` to the success swatch", () => {
    expect(taskStatusBadgeVariant("done")).toBe("success");
  });

  it("maps `blocked` and `cancelled` to the danger swatch", () => {
    expect(taskStatusBadgeVariant("blocked")).toBe("danger");
    expect(taskStatusBadgeVariant("cancelled")).toBe("danger");
  });

  it("maps `in_review` to the warning swatch", () => {
    expect(taskStatusBadgeVariant("in_review")).toBe("warning");
  });

  it("maps `in_progress` to the info swatch", () => {
    expect(taskStatusBadgeVariant("in_progress")).toBe("info");
  });

  it("maps `backlog` to the neutral default swatch", () => {
    expect(taskStatusBadgeVariant("backlog")).toBe("default");
  });

  it("falls back to the neutral default for unknown statuses (defensive)", () => {
    expect(taskStatusBadgeVariant("future_status_we_dont_know_about")).toBe("default");
  });
});

describe("priorityBadgeVariant", () => {
  it("maps `urgent` to the danger swatch (admin quick-overview)", () => {
    expect(priorityBadgeVariant("urgent")).toBe("danger");
  });

  it("maps `high` to the warning swatch", () => {
    expect(priorityBadgeVariant("high")).toBe("warning");
  });

  it("maps `normal` to the neutral default swatch", () => {
    expect(priorityBadgeVariant("normal")).toBe("default");
  });

  it("maps `low` to the info swatch (muted, not neutral)", () => {
    expect(priorityBadgeVariant("low")).toBe("info");
  });

  it("falls back to the neutral default for unknown priorities", () => {
    expect(priorityBadgeVariant("eventually")).toBe("default");
  });
});
