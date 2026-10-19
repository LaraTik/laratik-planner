import { describe, expect, it } from "vitest";
import { stateAfterAssignment } from "@/lib/community/assignment";

describe("community conversation assignment", () => {
  it("marks active conversations assigned and returns unassigned ones to open", () => {
    expect(stateAfterAssignment("open", "member-1")).toBe("assigned");
    expect(stateAfterAssignment("assigned", null)).toBe("open");
  });

  it("preserves waiting, resolved, and spam states while changing ownership", () => {
    expect(stateAfterAssignment("waiting_customer", "member-1")).toBe("waiting_customer");
    expect(stateAfterAssignment("resolved", "member-1")).toBe("resolved");
    expect(stateAfterAssignment("spam", null)).toBe("spam");
  });
});
