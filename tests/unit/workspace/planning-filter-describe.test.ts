import { describe, expect, it } from "vitest";
import { describeActiveFilter } from "@/app/(app)/app/w/[slug]/planning/filter-describe";

/**
 * UX-04 (GAP-FULL-REVIEW-2026-08-25) — the Planning empty state used
 * to lie when filters were active (it said "nothing planned for this
 * month" even when the user had a `status=published` filter that
 * produced no rows). The page now renders a filter-aware empty state
 * whose description names the active filter via `describeActiveFilter`.
 *
 * These tests pin the helper's behaviour so a future tweak to the
 * join rules does not silently ship a sentence like "No items match ."
 */

describe("describeActiveFilter", () => {
  it('returns "the active filter" when no clause is provided', () => {
    expect(describeActiveFilter({})).toBe("the active filter");
  });

  it("names a single status with title-cased label", () => {
    expect(describeActiveFilter({ status: "draft" })).toBe('status "Draft"');
  });

  it("title-cases a format clause", () => {
    expect(describeActiveFilter({ format: "short_form_video" })).toBe('format "Short Form Video"');
  });

  it("names the owner without exposing the id", () => {
    expect(describeActiveFilter({ ownerId: "u-1234" })).toBe("the selected owner");
  });

  it("includes the raw search term in quotes", () => {
    expect(describeActiveFilter({ search: "spring 2026" })).toBe('search "spring 2026"');
  });

  it("names the at_risk filter literally", () => {
    expect(describeActiveFilter({ risk: "at_risk" })).toBe('"at risk"');
  });

  it("names the modern planning toolbar filters", () => {
    expect(
      describeActiveFilter({
        stage: "approved_for_design",
        channelId: "ch-1",
        health: "needs_review",
      }),
    ).toBe('stage "Approved For Design", the selected channel, and health "Needs Review"');
  });

  it("ignores an unknown risk value rather than naming it", () => {
    // Defensive: a future risk value (e.g. "behind") should not leak
    // raw into the description. The user gets a fallback phrase.
    expect(describeActiveFilter({ risk: "behind" as never })).toBe("the active filter");
  });

  it('joins two clauses with " and "', () => {
    expect(describeActiveFilter({ status: "draft", search: "spring" })).toBe(
      'status "Draft" and search "spring"',
    );
  });

  it('joins three or more clauses with commas and a final " and "', () => {
    expect(
      describeActiveFilter({
        status: "draft",
        format: "carousel",
        ownerId: "u-1",
      }),
    ).toBe('status "Draft", format "Carousel", and the selected owner');
  });

  it("preserves the input order so the description matches the toolbar layout", () => {
    // Status → Format → Owner → Search → Risk is the order the toolbar
    // exposes them, so the description should mirror that order.
    const result = describeActiveFilter({
      status: "ready_to_publish",
      format: "static_post",
      ownerId: "u-1",
      search: "winter",
      risk: "at_risk",
    });
    expect(result).toBe(
      'status "Ready To Publish", format "Static Post", the selected owner, search "winter", and "at risk"',
    );
  });
});
