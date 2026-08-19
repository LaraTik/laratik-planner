import { describe, expect, it } from "vitest";
import { BatchCreateSchema } from "@/lib/content/batch";

describe("batch content creation", () => {
  it("accepts realistic rows and rejects empty or oversized batches", () => {
    const row = {
      title: "Launch teaser",
      format: "short_form_video",
      plannedPublishAt: "2026-09-01T09:00:00Z",
    };
    expect(
      BatchCreateSchema.safeParse({
        workspaceId: "95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa",
        items: [row],
      }).success,
    ).toBe(true);
    expect(
      BatchCreateSchema.safeParse({
        workspaceId: "95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa",
        items: [],
      }).success,
    ).toBe(false);
    expect(
      BatchCreateSchema.safeParse({
        workspaceId: "95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa",
        items: Array(51).fill(row),
      }).success,
    ).toBe(false);
  });
});
