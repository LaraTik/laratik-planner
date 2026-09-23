import { describe, expect, it } from "vitest";
import { canTransitionTaskStatus, TASK_STATUSES } from "@/lib/tasks/workflow";

describe("task workflow", () => {
  it("keeps the supported statuses explicit", () => {
    expect(TASK_STATUSES).toEqual([
      "backlog",
      "in_progress",
      "blocked",
      "in_review",
      "done",
      "cancelled",
    ]);
  });

  it("allows the forward work path and recovery from blocked work", () => {
    expect(canTransitionTaskStatus("backlog", "in_progress")).toBe(true);
    expect(canTransitionTaskStatus("in_progress", "in_review")).toBe(true);
    expect(canTransitionTaskStatus("in_review", "done")).toBe(true);
    expect(canTransitionTaskStatus("blocked", "in_progress")).toBe(true);
  });

  it("rejects skipping workflow gates and reopening cancellation directly", () => {
    expect(canTransitionTaskStatus("backlog", "done")).toBe(false);
    expect(canTransitionTaskStatus("in_review", "backlog")).toBe(false);
    expect(canTransitionTaskStatus("cancelled", "done")).toBe(false);
  });

  it("permits an idempotent update", () => {
    for (const status of TASK_STATUSES) {
      expect(canTransitionTaskStatus(status, status)).toBe(true);
    }
  });
});
