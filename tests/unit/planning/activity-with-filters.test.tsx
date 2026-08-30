import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ActivityWithFilters,
  type ActivityFilterId,
} from "@/components/planning/activity-with-filters";
import type { ActivityEventView } from "@/components/planning/activity-timeline";

const baseEvent: ActivityEventView = {
  id: "e-1",
  kind: "status_transition",
  summary: "moved the workflow forward",
  actorName: "Ada",
  occurredAt: "2026-09-01T09:00:00.000Z",
  metadata: null,
};

function makeEvent(kind: string, id: string): ActivityEventView {
  return { ...baseEvent, id, kind };
}

const events: ActivityEventView[] = [
  makeEvent("status_transition", "wf-1"),
  makeEvent("status_transition", "wf-2"),
  makeEvent("comment", "c-1"),
  makeEvent("delivery", "d-1"),
  makeEvent("publication", "p-1"),
  makeEvent("schedule_change", "s-1"),
  makeEvent("ai_assistance", "a-1"),
  makeEvent("create", "x-1"),
];

describe("ActivityWithFilters", () => {
  it("renders all five filter chips with counts", () => {
    render(<ActivityWithFilters events={events} />);
    const toolbar = screen.getByTestId("activity-filter-chips");
    const chips = within(toolbar).getAllByRole("button");
    expect(chips).toHaveLength(5);
    // All = 8, Workflow = 2 (2 status_transition), Comments = 1, Publishing = 3 (delivery+publication+schedule_change), System = 2 (ai_assistance+create)
    expect(within(toolbar).getByTestId("activity-filter-all")).toHaveAttribute("data-count", "8");
    expect(within(toolbar).getByTestId("activity-filter-workflow")).toHaveAttribute(
      "data-count",
      "2",
    );
    expect(within(toolbar).getByTestId("activity-filter-comments")).toHaveAttribute(
      "data-count",
      "1",
    );
    expect(within(toolbar).getByTestId("activity-filter-publishing")).toHaveAttribute(
      "data-count",
      "3",
    );
    expect(within(toolbar).getByTestId("activity-filter-system")).toHaveAttribute(
      "data-count",
      "2",
    );
  });

  it("renders every event by default (All filter)", () => {
    render(<ActivityWithFilters events={events} />);
    const timeline = screen.getByTestId("activity-timeline");
    const items = within(timeline).getAllByTestId("activity-event");
    expect(items).toHaveLength(8);
  });

  it("switches to the Workflow filter when its chip is clicked", async () => {
    const user = userEvent.setup();
    render(<ActivityWithFilters events={events} />);
    await user.click(screen.getByTestId("activity-filter-workflow"));
    const timeline = screen.getByTestId("activity-timeline");
    const items = within(timeline).getAllByTestId("activity-event");
    expect(items).toHaveLength(2);
    // The chip is marked aria-pressed
    expect(screen.getByTestId("activity-filter-workflow")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("activity-filter-all")).toHaveAttribute("aria-pressed", "false");
  });

  it("switches to the Publishing filter and only shows publishing events", async () => {
    const user = userEvent.setup();
    render(<ActivityWithFilters events={events} />);
    await user.click(screen.getByTestId("activity-filter-publishing"));
    const items = within(screen.getByTestId("activity-timeline")).getAllByTestId("activity-event");
    expect(items).toHaveLength(3);
    for (const item of items) {
      const kind = item.getAttribute("data-event-kind");
      expect(["delivery", "publication", "schedule_change"]).toContain(kind);
    }
  });

  it("renders the empty-filtered state when a bucket has no events", async () => {
    const user = userEvent.setup();
    const commentsOnly: ActivityEventView[] = [makeEvent("comment", "c-1")];
    render(<ActivityWithFilters events={commentsOnly} />);
    // Comments has 1, Workflow has 0 — switch to Workflow.
    await user.click(screen.getByTestId("activity-filter-workflow"));
    const empty = screen.getByTestId("activity-filter-empty");
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveTextContent(/No workflow activity yet/);
  });

  it("respects a custom default filter", () => {
    render(<ActivityWithFilters events={events} defaultFilter={"comments" as ActivityFilterId} />);
    expect(screen.getByTestId("activity-filter-comments")).toHaveAttribute("aria-pressed", "true");
    const items = within(screen.getByTestId("activity-timeline")).getAllByTestId("activity-event");
    expect(items).toHaveLength(1);
  });
});
