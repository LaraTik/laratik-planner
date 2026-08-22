import { describe, expect, it } from "vitest";
import { parseBatchRows, BatchCreateSchema } from "@/lib/content/batch";

describe("parseBatchRows", () => {
  it("parses rows separated by | with title|format|date|brief", () => {
    const rows = parseBatchRows("Hello World | static_post | 2026-08-25 | a quick hello");
    expect(rows).toEqual([
      {
        title: "Hello World",
        format: "static_post",
        plannedPublishAt: "2026-08-25",
        brief: "a quick hello",
      },
    ]);
  });

  it("defaults format to static_post and brief to empty when omitted", () => {
    const rows = parseBatchRows("Just a title | story | 2026-09-01");
    expect(rows).toEqual([
      { title: "Just a title", format: "story", plannedPublishAt: "2026-09-01", brief: "" },
    ]);
  });

  it("treats | with no trailing parts as empty defaults", () => {
    // "Title only" with no '|' at all -> the destructure defaults fill in
    const rows = parseBatchRows("Title only");
    expect(rows).toEqual([
      { title: "Title only", format: "static_post", plannedPublishAt: "", brief: "" },
    ]);
  });

  it("preserves empty cells (not undefined) as trimmed empty strings", () => {
    // When the user explicitly leaves cells empty, the destructuring defaults
    // don't fire (only undefined triggers them). The cells stay empty strings.
    const rows = parseBatchRows("Title only ||");
    expect(rows).toEqual([{ title: "Title only", format: "", plannedPublishAt: "", brief: "" }]);
  });

  it("trims whitespace from each cell and skips empty lines", () => {
    const rows = parseBatchRows(
      "\n\n  Title  |  story  |  2026-08-30  \n\n   \nAnother | carousel | 2026-09-01\n",
    );
    expect(rows).toEqual([
      { title: "Title", format: "story", plannedPublishAt: "2026-08-30", brief: "" },
      { title: "Another", format: "carousel", plannedPublishAt: "2026-09-01", brief: "" },
    ]);
  });

  it("handles CRLF line endings", () => {
    const rows = parseBatchRows("Row A | story | 2026-08-30\r\nRow B | article | 2026-09-01");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.title).toBe("Row A");
    expect(rows[1]?.title).toBe("Row B");
  });
});

describe("BatchCreateSchema", () => {
  it("accepts a valid batch payload and coerces plannedPublishAt to Date", () => {
    const result = BatchCreateSchema.safeParse({
      workspaceId: "95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa",
      items: [{ title: "Item A", format: "story", plannedPublishAt: "2026-08-25" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0]?.plannedPublishAt).toBeInstanceOf(Date);
    }
  });

  it("rejects empty items array", () => {
    const result = BatchCreateSchema.safeParse({
      workspaceId: "95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa",
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 50 items", () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      title: `Item ${i}`,
      format: "story" as const,
      plannedPublishAt: "2026-08-25",
    }));
    const result = BatchCreateSchema.safeParse({
      workspaceId: "95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa",
      items,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid workspaceId", () => {
    const result = BatchCreateSchema.safeParse({
      workspaceId: "not-a-uuid",
      items: [{ title: "Item", format: "story", plannedPublishAt: "2026-08-25" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a too-short title", () => {
    const result = BatchCreateSchema.safeParse({
      workspaceId: "95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa",
      items: [{ title: "a", format: "story", plannedPublishAt: "2026-08-25" }],
    });
    expect(result.success).toBe(false);
  });

  it("defaults brief to empty string when omitted", () => {
    const result = BatchCreateSchema.safeParse({
      workspaceId: "95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa",
      items: [{ title: "Item", format: "story", plannedPublishAt: "2026-08-25" }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.items[0]?.brief).toBe("");
  });
});
