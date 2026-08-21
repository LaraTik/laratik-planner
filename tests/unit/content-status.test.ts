import { describe, expect, it } from "vitest";
import {
  ALL_FORMATS,
  ALL_STATUSES,
  BLOCKED_STATUSES,
  DONE_STATUSES,
  OPEN_STATUSES,
  humanFormat,
  humanStatus,
  humanize,
  isBlocked,
  isDone,
  isOpen,
  statusBadgeVariant,
  type ContentFormat,
  type ContentStatus,
} from "@/lib/content/status";

describe("content/status — humanize family", () => {
  it("humanize converts underscores to spaces and title-cases", () => {
    expect(humanize("ready_to_publish")).toBe("Ready To Publish");
    expect(humanize("short_form_video")).toBe("Short Form Video");
    expect(humanize("in_design")).toBe("In Design");
  });

  it("humanize handles single-word and empty inputs safely", () => {
    expect(humanize("draft")).toBe("Draft");
    expect(humanize("")).toBe("");
  });

  it("humanize is defensive against unknown values (no throw)", () => {
    expect(humanize("some_weird_state")).toBe("Some Weird State");
    // Hyphens are not separators; only underscores are. The regex
    // capitalises the first letter of every word boundary, which
    // includes the letter right after the hyphen.
    expect(humanize("kebab-case")).toBe("Kebab-Case");
  });

  it("humanStatus and humanFormat are aliases for humanize", () => {
    expect(humanStatus("ready_to_publish")).toBe(humanize("ready_to_publish"));
    expect(humanFormat("static_post")).toBe(humanize("static_post"));
  });
});

describe("content/status — statusBadgeVariant", () => {
  it("maps success-path states to the success variant", () => {
    expect(statusBadgeVariant("ready_to_publish")).toBe("success");
    expect(statusBadgeVariant("published")).toBe("success");
  });

  it("maps danger-path states to the danger variant", () => {
    expect(statusBadgeVariant("blocked")).toBe("danger");
    expect(statusBadgeVariant("cancelled")).toBe("danger");
  });

  it("maps warning and review states to the right variants", () => {
    expect(statusBadgeVariant("changes_requested")).toBe("warning");
    expect(statusBadgeVariant("in_design")).toBe("info");
    expect(statusBadgeVariant("creative_review")).toBe("info");
    expect(statusBadgeVariant("content_review")).toBe("info");
    expect(statusBadgeVariant("partially_published")).toBe("primary");
    expect(statusBadgeVariant("approved_for_design")).toBe("primary");
  });

  it("falls back to default for unknown values", () => {
    expect(statusBadgeVariant("draft")).toBe("default");
    expect(statusBadgeVariant("mystery_state")).toBe("default");
  });
});

describe("content/status — status grouping predicates", () => {
  it("isOpen is true for every OPEN_STATUSES entry and false otherwise", () => {
    for (const s of OPEN_STATUSES) {
      expect(isOpen(s)).toBe(true);
    }
    for (const s of DONE_STATUSES) {
      expect(isOpen(s)).toBe(false);
    }
    for (const s of BLOCKED_STATUSES) {
      expect(isOpen(s)).toBe(false);
    }
  });

  it("isDone is true only for published", () => {
    expect(isDone("published")).toBe(true);
    expect(isDone("draft")).toBe(false);
    expect(isDone("ready_to_publish")).toBe(false);
  });

  it("isBlocked is true for blocked + cancelled", () => {
    expect(isBlocked("blocked")).toBe(true);
    expect(isBlocked("cancelled")).toBe(true);
    expect(isBlocked("published")).toBe(false);
    expect(isBlocked("draft")).toBe(false);
  });
});

describe("content/status — exported lists are exhaustive and typed", () => {
  it("ALL_STATUSES contains every ContentStatus", () => {
    // Every member of the type union is present in the runtime list.
    const everyStatus: ContentStatus[] = [
      "draft",
      "content_review",
      "approved_for_design",
      "in_design",
      "creative_review",
      "ready_to_publish",
      "partially_published",
      "published",
      "changes_requested",
      "blocked",
      "cancelled",
    ];
    for (const s of everyStatus) {
      expect(ALL_STATUSES).toContain(s);
    }
    expect(ALL_STATUSES).toHaveLength(everyStatus.length);
  });

  it("ALL_FORMATS contains every ContentFormat", () => {
    const everyFormat: ContentFormat[] = [
      "static_post",
      "carousel",
      "story",
      "short_form_video",
      "long_form_video",
      "live_content",
      "article",
      "other",
    ];
    for (const f of everyFormat) {
      expect(ALL_FORMATS).toContain(f);
    }
    expect(ALL_FORMATS).toHaveLength(everyFormat.length);
  });

  it("OPEN_STATUSES + DONE_STATUSES + BLOCKED_STATUSES cover ALL_STATUSES exactly", () => {
    const union = new Set<string>([...OPEN_STATUSES, ...DONE_STATUSES, ...BLOCKED_STATUSES]);
    expect(union.size).toBe(ALL_STATUSES.length);
    for (const s of ALL_STATUSES) {
      expect(union.has(s)).toBe(true);
    }
  });
});
