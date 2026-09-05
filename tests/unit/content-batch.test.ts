import { describe, expect, it } from "vitest";
import { BatchCreateSchema, parseBatchRows } from "@/lib/content/batch";

describe("parseBatchRows", () => {
  it("parses the four-field pipe syntax", () => {
    const [row] = parseBatchRows("Hello World | static_post | 2026-08-25 | a quick hello");
    expect(row).toMatchObject({
      lineNumber: 1,
      title: "Hello World",
      format: "static_post",
      plannedPublishAt: "2026-08-25",
      brief: "a quick hello",
      extensions: {},
      channelNames: [],
      issues: [],
    });
  });

  it("requires missing format and date instead of silently defaulting", () => {
    const [row] = parseBatchRows("Just a title");
    expect(row?.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["format_required", "date_required"]),
    );
  });

  it("preserves empty cells and physical line numbers", () => {
    const rows = parseBatchRows(
      "\n\n  Title  |  story  |  2026-08-30  \n\n   \nAnother | carousel | 2026-09-01\n",
    );
    expect(rows[0]).toMatchObject({ lineNumber: 3, title: "Title", format: "story" });
    expect(rows[1]).toMatchObject({ lineNumber: 6, title: "Another", format: "carousel" });
  });

  it("extracts optional caption and hashtags", () => {
    const [row] = parseBatchRows(
      "Spring drop | static_post | 2026-09-05T09:00:00Z | The reveal | Pre-order | #spring #drop",
    );
    expect(row?.extensions).toEqual({ caption: "Pre-order", hashtags: ["#spring", "#drop"] });
  });
});

describe("BatchCreateSchema", () => {
  const workspaceId = "95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa";

  it("accepts a valid payload and coerces dates", () => {
    const result = BatchCreateSchema.safeParse({
      workspaceId,
      items: [{ title: "Item A", format: "story", plannedPublishAt: "2026-08-25" }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.items[0]?.plannedPublishAt).toBeInstanceOf(Date);
  });

  it("enforces batch limits and identifiers", () => {
    expect(BatchCreateSchema.safeParse({ workspaceId, items: [] }).success).toBe(false);
    expect(
      BatchCreateSchema.safeParse({
        workspaceId,
        items: Array.from({ length: 51 }, (_, i) => ({
          title: `Item ${i}`,
          format: "story",
          plannedPublishAt: "2026-08-25",
        })),
      }).success,
    ).toBe(false);
    expect(
      BatchCreateSchema.safeParse({
        workspaceId: "not-a-uuid",
        items: [{ title: "Item", format: "story", plannedPublishAt: "2026-08-25" }],
      }).success,
    ).toBe(false);
  });

  it("accepts intentional empty channel selection and extensions", () => {
    const result = BatchCreateSchema.safeParse({
      workspaceId,
      items: [
        {
          title: "Spring drop",
          format: "static_post",
          plannedPublishAt: "2026-09-05T09:00:00Z",
          channelIds: [],
          extensions: { caption: "Pre-order now", hashtags: ["#spring"] },
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.items[0]?.channelIds).toEqual([]);
  });
});
