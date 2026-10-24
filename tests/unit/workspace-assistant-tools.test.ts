import { describe, expect, it } from "vitest";
import { createWorkspaceAssistantTools } from "@/features/workspace-assistant";

describe("workspace assistant read tools", () => {
  it("exposes bounded summaries and never accepts a workspace selector", async () => {
    const tools = createWorkspaceAssistantTools({
      planContext: [
        {
          name: "get_plan_summary",
          summary: "The month has two items.",
          data: { itemCount: 2, evidenceId: "workspace-content-2026-11" },
        },
      ],
      selectedPlanItems: Array.from({ length: 25 }, (_, index) => ({
        id: `item-${index}`,
        title: `Post ${index}`,
        brief: "Bounded brief",
        format: "post",
        status: "draft",
        plannedPublishAt: "2026-11-01T10:00:00.000Z",
        revision: 1,
      })),
      selectedContentItem: null,
      brandContext: null,
      brandEvidenceId: null,
      brandKnowledge: [],
    });
    const summary = tools.find((tool) => tool.name === "planner_get_plan_summary");
    const list = tools.find((tool) => tool.name === "planner_list_plan_items");

    expect(summary).toBeDefined();
    expect(tools.some((tool) => tool.name === "planner_get_workload_summary")).toBe(false);
    expect(list?.input.safeParse({ workspaceId: "another-tenant" }).success).toBe(false);
    await expect(list?.execute({ limit: 20 })).resolves.toMatchObject({
      returned: 20,
      availableBoundedItems: 25,
    });
    await expect(list?.execute({ limit: 21 })).rejects.toThrow();
  });

  it("offers selected item and brand tools only when authorized context is present", async () => {
    const tools = createWorkspaceAssistantTools({
      planContext: [],
      selectedPlanItems: [],
      selectedContentItem: {
        name: "read_selected_content_item",
        summary: "One selected item.",
        data: { evidenceId: "content-item-1-revision-2" },
      },
      brandContext: { voice: ["Warm"] },
      brandEvidenceId: "workspace-brand-context-2026-11",
      brandKnowledge: [],
    });

    expect(tools.map((tool) => tool.name)).toContain("planner_read_selected_content_item");
    expect(tools.map((tool) => tool.name)).toContain("planner_get_brand_guidance");
    expect(
      await tools.find((tool) => tool.name === "planner_get_brand_guidance")?.execute({}),
    ).toEqual({
      context: { voice: ["Warm"] },
      evidenceId: "workspace-brand-context-2026-11",
    });
  });

  it("exposes workload only from the server-preloaded active-workspace result", async () => {
    const tools = createWorkspaceAssistantTools({
      planContext: [
        {
          name: "get_workload_summary",
          summary: "Assignment counts for this month.",
          data: {
            contentOwnerAssignments: ["Maya: 3", "Unassigned: 1"],
            designerAssignments: ["Omar: 2", "Unassigned: 2"],
            evidenceId: "workspace-workload-2026-11",
          },
        },
      ],
      selectedPlanItems: [],
      selectedContentItem: null,
      brandContext: null,
      brandEvidenceId: null,
      brandKnowledge: [],
    });
    const workload = tools.find((tool) => tool.name === "planner_get_workload_summary");

    expect(workload?.input.safeParse({ workspaceId: "another-workspace" }).success).toBe(false);
    await expect(workload?.execute({})).resolves.toMatchObject({
      data: {
        contentOwnerAssignments: ["Maya: 3", "Unassigned: 1"],
        designerAssignments: ["Omar: 2", "Unassigned: 2"],
        evidenceId: "workspace-workload-2026-11",
      },
    });
  });

  it("rejects duplicate tool IDs before exposing the registry", () => {
    const result = () =>
      createWorkspaceAssistantTools({
        planContext: [],
        selectedPlanItems: [],
        selectedContentItem: null,
        brandContext: null,
        brandEvidenceId: null,
        brandKnowledge: [],
      });
    expect(result).not.toThrow();
    const tools = result();
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);
  });

  it("searches bounded authorized knowledge and includes provenance", async () => {
    const tools = createWorkspaceAssistantTools({
      planContext: [],
      selectedPlanItems: [],
      selectedContentItem: null,
      brandContext: null,
      brandEvidenceId: null,
      brandKnowledge: [
        {
          id: "knowledge-1",
          category: "brand",
          title: "Brand voice",
          content: "Use a calm, helpful voice.",
          tags: ["voice"],
          sourceUrl: "https://example.test/brand",
          verificationStatus: "verified",
          verifiedAt: new Date("2026-10-01T00:00:00.000Z"),
          revision: 3,
        },
      ],
    });
    const search = tools.find((tool) => tool.name === "planner_search_brand_knowledge");

    expect(search?.input.safeParse({ query: "voice", workspaceId: "other" }).success).toBe(false);
    await expect(search?.execute({ query: "voice" })).resolves.toMatchObject({
      entries: [
        expect.objectContaining({
          title: "Brand voice",
          verificationStatus: "verified",
          revision: 3,
          evidenceId: "assistant-knowledge-knowledge-1-r3",
        }),
      ],
    });
  });
});
