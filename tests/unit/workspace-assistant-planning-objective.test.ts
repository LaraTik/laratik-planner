import { describe, expect, it } from "vitest";
import {
  inferPlanningObjective,
  isExplicitItemEditRequest,
  isPlanImprovementRequest,
} from "@/features/workspace-assistant/planning-objective";

describe("workspace assistant planning objective", () => {
  describe("inferPlanningObjective", () => {
    it("reads a clearly stated custom objective", () => {
      expect(inferPlanningObjective("My goal is awareness in Riyadh")).toEqual({
        type: "custom",
        customText: "awareness in Riyadh",
      });
    });

    it("maps a stated outcome to its objective type", () => {
      expect(inferPlanningObjective("I want to increase engagement")).toEqual({
        type: "engagement",
      });
      expect(inferPlanningObjective("أريد زيادة التفاعل")).toEqual({ type: "engagement" });
    });

    it("returns null when no outcome is stated", () => {
      expect(inferPlanningObjective("Summarize the plan for November")).toBeNull();
    });
  });

  describe("isPlanImprovementRequest", () => {
    it("treats a strategic review request as an improvement request", () => {
      expect(
        isPlanImprovementRequest({
          message: "How can I improve my monthly plan?",
          mode: "plan",
        }),
      ).toBe(true);
    });

    it("treats a descriptive plan request as not an improvement request", () => {
      expect(
        isPlanImprovementRequest({
          message: "Summarize the plan for November",
          mode: "plan",
        }),
      ).toBe(false);
    });

    it("never asks for an objective in apply mode", () => {
      expect(
        isPlanImprovementRequest({
          message: "How can I improve my monthly plan?",
          mode: "apply",
        }),
      ).toBe(false);
    });

    it("treats the saved plan-improvement prompt as an improvement request", () => {
      expect(
        isPlanImprovementRequest({
          message: "Run it",
          mode: "plan",
          promptId: "practical-plan-improvements",
        }),
      ).toBe(true);
    });

    it("keeps an explicit edit of the selected item out of the improvement flow", () => {
      expect(
        isPlanImprovementRequest({
          message: "Improve the selected draft schedule",
          mode: "plan",
          userMessage: "Improve the selected draft schedule",
        }),
      ).toBe(false);
    });

    it("detects the explicit edit from the user's wording when a saved prompt is used", () => {
      expect(
        isPlanImprovementRequest({
          message: "Offer up to three small, actionable improvements based only on dates.",
          mode: "plan",
          promptId: "practical-plan-improvements",
          userMessage: "Improve the selected draft schedule",
        }),
      ).toBe(false);
    });
  });

  describe("isExplicitItemEditRequest", () => {
    it("detects an edit scoped to one selected item", () => {
      expect(isExplicitItemEditRequest("Improve the selected draft schedule")).toBe(true);
      expect(isExplicitItemEditRequest("Move the selected post to November 8")).toBe(true);
      expect(isExplicitItemEditRequest("Rewrite the title of the selected draft")).toBe(true);
      expect(isExplicitItemEditRequest("حسّن موعد المنشور المحدد")).toBe(true);
    });

    it("does not treat a plan-level request as an item edit", () => {
      expect(isExplicitItemEditRequest("How can I improve my monthly plan?")).toBe(false);
      expect(isExplicitItemEditRequest("Improve the content mix")).toBe(false);
      expect(isExplicitItemEditRequest("Summarize the selected draft")).toBe(false);
    });

    it("handles an empty message", () => {
      expect(isExplicitItemEditRequest("")).toBe(false);
      expect(isExplicitItemEditRequest(null)).toBe(false);
    });
  });
});
