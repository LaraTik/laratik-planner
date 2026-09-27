import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ActivityDiff } from "@/components/activity/activity-diff";
import type { ActivityDiff as DiffSpec } from "@/lib/activity/types";

describe("ActivityDiff — chip shape", () => {
  it("renders before/after labels with the field label", () => {
    const diff: DiffSpec = {
      field: "status",
      fieldLabel: "Status",
      before: { label: "Draft" },
      after: { label: "Content review" },
      shape: "chip",
    };
    render(<ActivityDiff diff={diff} />);
    const node = screen.getByTestId("activity-diff-chip");
    expect(node).toHaveTextContent("Status");
    expect(within(node).getByTestId("activity-diff-before")).toHaveTextContent("Draft");
    expect(within(node).getByTestId("activity-diff-after")).toHaveTextContent("Content review");
  });

  it("tone-codes promoting status transitions as success", () => {
    const diff: DiffSpec = {
      field: "status",
      fieldLabel: "Status",
      before: { label: "Draft" },
      after: { label: "Ready to publish" },
      shape: "chip",
    };
    render(<ActivityDiff diff={diff} />);
    const after = screen.getByTestId("activity-diff-after");
    expect(after.className).toContain("bg-success-subtle");
  });

  it("tone-codes regressions as warning", () => {
    const diff: DiffSpec = {
      field: "status",
      fieldLabel: "Status",
      before: { label: "Published" },
      after: { label: "Blocked" },
      shape: "chip",
    };
    render(<ActivityDiff diff={diff} />);
    const after = screen.getByTestId("activity-diff-after");
    expect(after.className).toContain("bg-warning-subtle");
  });
});

describe("ActivityDiff — text shape (short)", () => {
  it("renders before/after in a two-column layout for short text", () => {
    const diff: DiffSpec = {
      field: "brief",
      fieldLabel: "Brief",
      before: { label: "old brief" },
      after: { label: "new brief" },
      shape: "text",
    };
    render(<ActivityDiff diff={diff} />);
    const node = screen.getByTestId("activity-diff-text");
    expect(within(node).getByTestId("activity-diff-before")).toHaveTextContent("old brief");
    expect(within(node).getByTestId("activity-diff-after")).toHaveTextContent("new brief");
    const beforeSpan = within(node).getByTestId("activity-diff-before");
    expect(beforeSpan.className).toContain("line-through");
  });
});

describe("ActivityDiff — text shape (long)", () => {
  it("renders inside a <details> for long text", () => {
    const long = "x".repeat(300);
    const diff: DiffSpec = {
      field: "brief",
      fieldLabel: "Brief",
      before: { label: long },
      after: { label: "short" },
      shape: "text",
    };
    render(<ActivityDiff diff={diff} />);
    const node = screen.getByTestId("activity-diff-text");
    // The <details> element wraps the diff when the text is long.
    expect(node.tagName.toLowerCase()).toBe("details");
  });
});
