import { describe, expect, it } from "vitest";
import { parseBatchRows, BatchCreateSchema } from "@/lib/content/batch";

describe("parseBatchRows", () => {
  it("parses rows separated by | with title|format|date|brief", () => {
    const rows = parseBatchRows("Hello World | static_post | 2026-08-25 | a quick hello");
    expect(rows).toEqual([
      {
        lineNumber: 1,
        title: "Hello World",
        format: "static_post",
        plannedPublishAt: "2026-08-25",
        brief: "a quick hello",
        extensions: {},
      },
    ]);
  });

  it("defaults format to static_post and brief to empty when omitted", () => {
    const rows = parseBatchRows("Just a title | story | 2026-09-01");
    expect(rows).toEqual([
      {
        lineNumber: 1,
        title: "Just a title",
        format: "story",
        plannedPublishAt: "2026-09-01",
        brief: "",
        extensions: {},
      },
    ]);
  });

  it("treats | with no trailing parts as empty defaults", () => {
    // "Title only" with no '|' at all -> the destructure defaults fill in
    const rows = parseBatchRows("Title only");
    expect(rows).toEqual([
      {
        lineNumber: 1,
        title: "Title only",
        format: "static_post",
        plannedPublishAt: "",
        brief: "",
        extensions: {},
      },
    ]);
  });

  it("preserves empty cells (not undefined) as trimmed empty strings", () => {
    // When the user explicitly leaves cells empty, the destructuring defaults
    // don't fire (only undefined triggers them). The cells stay empty strings.
    const rows = parseBatchRows("Title only ||");
    expect(rows).toEqual([
      {
        lineNumber: 1,
        title: "Title only",
        format: "",
        plannedPublishAt: "",
        brief: "",
        extensions: {},
      },
    ]);
  });

  it("trims whitespace from each cell and skips empty lines", () => {
    const rows = parseBatchRows(
      "\n\n  Title  |  story  |  2026-08-30  \n\n   \nAnother | carousel | 2026-09-01\n",
    );
    // `lineNumber` is the position among the *non-empty* rows
    // (the parser drops blank lines before numbering).
    expect(rows).toEqual([
      {
        lineNumber: 1,
        title: "Title",
        format: "story",
        plannedPublishAt: "2026-08-30",
        brief: "",
        extensions: {},
      },
      {
        lineNumber: 2,
        title: "Another",
        format: "carousel",
        plannedPublishAt: "2026-09-01",
        brief: "",
        extensions: {},
      },
    ]);
  });

  it("handles CRLF line endings", () => {
    const rows = parseBatchRows("Row A | story | 2026-08-30\r\nRow B | article | 2026-09-01");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.title).toBe("Row A");
    expect(rows[1]?.title).toBe("Row B");
  });

  it("extracts the optional caption from the 5th field", () => {
    const rows = parseBatchRows(
      "Spring drop | static_post | 2026-09-05T09:00:00Z | The reveal | Pre-order now",
    );
    const first = rows[0];
    expect(first?.extensions).toBeDefined();
    expect((first?.extensions as { caption?: string }).caption).toBe("Pre-order now");
  });

  it("extracts the optional hashtags from the 6th field", () => {
    const rows = parseBatchRows(
      "Spring drop | static_post | 2026-09-05T09:00:00Z | The reveal | Pre-order | #spring #drop",
    );
    const first = rows[0];
    expect(first?.extensions).toBeDefined();
    expect((first?.extensions as { caption?: string }).caption).toBe("Pre-order");
    expect((first?.extensions as { hashtags?: string[] }).hashtags).toEqual(["#spring", "#drop"]);
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

  it("accepts an extensions bundle and re-validates per-format limits", () => {
    const result = BatchCreateSchema.safeParse({
      workspaceId: "95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa",
      items: [
        {
          title: "Spring drop",
          format: "static_post",
          plannedPublishAt: "2026-09-05T09:00:00Z",
          extensions: { caption: "Pre-order now", hashtags: ["#spring"] },
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0]?.extensions).toEqual({
        caption: "Pre-order now",
        hashtags: ["#spring"],
      });
    }
  });
});
