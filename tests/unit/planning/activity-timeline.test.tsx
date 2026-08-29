import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityTimeline, type ActivityEventView } from "@/components/planning/activity-timeline";

const EVENTS: ActivityEventView[] = [
  {
    id: "ev-1",
    kind: "status_transition",
    summary: "draft → content review",
    actorName: "Ada Lovelace",
    occurredAt: "2026-08-29T10:00:00.000Z",
  },
  {
    id: "ev-2",
    kind: "brief_updated",
    summary: "Updated the brief",
    actorName: "Grace Hopper",
    occurredAt: "2026-08-29T11:00:00.000Z",
  },
];

describe("ActivityTimeline", () => {
  it("renders each event with actor, summary, and time", () => {
    render(<ActivityTimeline events={EVENTS} />);
    const items = screen.getAllByTestId("activity-event");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Ada Lovelace");
    expect(items[0]).toHaveTextContent("draft → content review");
    expect(items[1]).toHaveTextContent("Grace Hopper");
  });

  it("falls back to a kind-based humanised string when no summary is given", () => {
    render(
      <ActivityTimeline
        events={[
          {
            id: "ev-1",
            kind: "delivery_submitted",
            summary: "",
            actorName: "Ada",
            occurredAt: "2026-08-29T10:00:00.000Z",
          },
        ]}
      />,
    );
    expect(screen.getByText(/submitted a delivery version/i)).toBeInTheDocument();
  });

  it("renders an empty state when no events are passed", () => {
    render(<ActivityTimeline events={[]} />);
    expect(screen.getByText(/No activity yet/i)).toBeInTheDocument();
  });

  it("truncates long event lists to maxEvents and shows a 'older events' note", () => {
    const many: ActivityEventView[] = Array.from({ length: 30 }, (_, i) => ({
      id: `ev-${i}`,
      kind: "status_transition",
      summary: `event ${i}`,
      actorName: "Ada",
      occurredAt: "2026-08-29T10:00:00.000Z",
    }));
    render(<ActivityTimeline events={many} maxEvents={10} />);
    expect(screen.getAllByTestId("activity-event")).toHaveLength(10);
    expect(screen.getByText(/\+20 older events/i)).toBeInTheDocument();
  });
});
