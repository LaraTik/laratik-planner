import { describe, expect, it } from "vitest";
import {
  discoverWorkspaceAssistantSkills,
  listWorkspaceAssistantSkills,
} from "@/features/workspace-assistant/skills";

describe("workspace assistant skill registry", () => {
  it("keeps discoverable metadata separate from full skill instructions", () => {
    const metadata = listWorkspaceAssistantSkills();
    expect(metadata).toHaveLength(30);
    expect(metadata.every((skill) => !("instructions" in skill))).toBe(true);
    expect(metadata.every((skill) => skill.version === "1.0.0")).toBe(true);
    expect(new Set(metadata.map((skill) => skill.category))).toEqual(
      new Set(["strategy", "planning", "creation", "quality"]),
    );
    expect(metadata.every((skill) => skill.provenance === "first-party")).toBe(true);
  });

  it("loads only relevant first-party skills for each request", () => {
    const skills = discoverWorkspaceAssistantSkills("Review the calendar gaps and content mix");
    expect(skills.map((skill) => skill.id)).toEqual([
      "monthly-plan-review",
      "calendar-diagnostics",
      "content-mix-review",
    ]);
    expect(
      discoverWorkspaceAssistantSkills("Suggest a brand voice improvement").map(
        (skill) => skill.id,
      ),
    ).toContain("brand-aware-recommendations");

    const videoSkills = discoverWorkspaceAssistantSkills("Write a Reels script with a hook").map(
      (skill) => skill.id,
    );
    expect(videoSkills).toContain("reels-script");
    expect(videoSkills).toContain("hook-writing");
    expect(videoSkills).not.toContain("content-performance-analysis");

    const workloadSkill = discoverWorkspaceAssistantSkills("Review our team workload").find(
      (skill) => skill.id === "workload-aware-planning",
    );
    expect(workloadSkill?.authorizedTools).toContain("planner_get_workload_summary");
    expect(workloadSkill?.instructions).toContain(
      "Assignment counts do not measure available hours",
    );
  });

  it("keeps skill instructions separate from authorized tool access", () => {
    const skill = discoverWorkspaceAssistantSkills("Create a Reels script").find(
      (item) => item.id === "reels-script",
    );
    expect(skill?.authorizedTools).toEqual(["planner_get_brand_guidance"]);
    expect(skill?.workflow.length).toBeGreaterThan(1);
    expect(skill?.qualityChecklist.length).toBeGreaterThan(1);
    expect(skill?.authorizedTools.some((tool) => /write|publish|approve|delete/i.test(tool))).toBe(
      false,
    );
  });

  it("selects reviewed agency skills by intent without allowing them to add tools", () => {
    const custom = {
      id: "agency-skill-id",
      version: "2",
      category: "planning" as const,
      name: "Regional campaign review",
      description: "Check regional requirements before recommending a campaign plan.",
      tags: ["regional"],
      triggers: ["regional campaign review"],
      examples: ["Review the regional campaign plan."],
      requiredInputs: ["market"],
      optionalInputs: [],
      supportedFormats: ["campaign plan"],
      requiredKnowledgeSources: ["approved workspace knowledge"],
      instructions: "Name missing regional facts and ask for approved evidence.",
      workflow: ["Check the requested region", "Identify missing facts"],
      outputContract: ["Findings", "Questions"],
      qualityChecklist: ["Do not infer regional law or audience preferences."],
      relatedSkills: [],
      authorizedTools: [],
      evaluationCases: [],
      provenance: "agency-admin" as const,
      reviewedAt: "2026-10-24",
    };
    const result = discoverWorkspaceAssistantSkills(
      "Please do a regional campaign review",
      undefined,
      [custom],
    );
    const selected = result.find((item) => item.id === "agency-skill-id");
    expect(selected?.instructions).toContain("approved evidence");
    expect(selected?.authorizedTools).toEqual([]);
  });
});
