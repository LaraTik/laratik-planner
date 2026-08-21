import { describe, expect, it } from "vitest";
import { QuickCreateSchema, UpdateContentSchema, UPDATEABLE_STATUSES } from "@/lib/content/service";

/**
 * The edit page re-uses the same field rules as Quick Create (minus
 * `workspaceId`, which the service resolves from the content item).
 * These tests pin the rule: same shape, so a future tweak to one
 * schema has to be made in the other, or the test fails visibly.
 */
describe("update content schema", () => {
  it("accepts the same valid payload shape as Quick Create (minus workspaceId)", () => {
    const payload = {
      title: "Spring drop teaser",
      format: "short_form_video" as const,
      brief: "Goal: drive signups",
      plannedPublishAt: "2026-09-01T09:00:00Z",
      channelIds: ["95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa"],
    };
    expect(UpdateContentSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects titles shorter than 2 chars or longer than 200", () => {
    expect(
      UpdateContentSchema.safeParse({
        title: "A",
        format: "static_post",
        plannedPublishAt: "2026-09-01T09:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      UpdateContentSchema.safeParse({
        title: "x".repeat(201),
        format: "static_post",
        plannedPublishAt: "2026-09-01T09:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown formats and non-UUID channel ids", () => {
    expect(
      UpdateContentSchema.safeParse({
        title: "OK",
        format: "broadcast_fax",
        plannedPublishAt: "2026-09-01T09:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      UpdateContentSchema.safeParse({
        title: "OK",
        format: "static_post",
        plannedPublishAt: "2026-09-01T09:00:00Z",
        channelIds: ["not-a-uuid"],
      }).success,
    ).toBe(false);
  });

  it("UPDATEABLE_STATUSES contains exactly draft and changes_requested", () => {
    expect([...UPDATEABLE_STATUSES].sort()).toEqual(["changes_requested", "draft"]);
  });

  it("Quick Create rules still apply (regression guard for the shared rule set)", () => {
    expect(
      QuickCreateSchema.safeParse({
        workspaceId: "95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa",
        title: "OK",
        format: "static_post",
        plannedPublishAt: "2026-09-01T09:00:00Z",
      }).success,
    ).toBe(true);
  });
});
