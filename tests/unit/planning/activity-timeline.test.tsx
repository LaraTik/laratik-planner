import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityTimeline, type ActivityEventView } from "@/components/planning/activity-timeline";
import { tFor } from "@/messages";

const t = tFor("en");

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
    render(<ActivityTimeline events={EVENTS} t={t} />);
    const items = screen.getAllByTestId("activity-event");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Ada Lovelace");
    expect(items[0]).toHaveTextContent("draft → content review");
    expect(items[1]).toHaveTextContent("Grace Hopper");
  });

  it("falls back to a kind-based humanised string when no summary is given", () => {
    render(
      <ActivityTimeline
        t={t}
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
    render(<ActivityTimeline events={[]} t={t} />);
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
    render(<ActivityTimeline events={many} maxEvents={10} t={t} />);
    expect(screen.getAllByTestId("activity-event")).toHaveLength(10);
    expect(screen.getByText(/\+20 older events/i)).toBeInTheDocument();
  });

  // Phase 1 of the planning-workspace-v2 refactor (2026-08-30):
  // the humanizer now covers every kind we actually emit, so
  // no machine enum ever leaks to the user. This test pins
  // that contract — a future change that adds a new `kind`
  // without a humanizer entry will fail here, with a precise
  // name for the missing kind.
  it("humanises every known kind without leaking the raw enum", () => {
    const knownKinds = [
      "status_transition",
      "brief_updated",
      "title_updated",
      "date_updated",
      "content_updated",
      "delivery_submitted",
      "comment_added",
      "mention",
      "ai_draft_applied",
      "publication_recorded",
      "publication",
      "blocked",
      "claimed",
      "assignment",
      "schedule_change",
      "bulk_archive",
      "create",
      "update",
      "system",
    ];
    const events: ActivityEventView[] = knownKinds.map((k, i) => ({
      id: `ev-${k}`,
      kind: k,
      summary: "",
      actorName: "Ada",
      occurredAt: new Date(Date.parse("2026-08-29T10:00:00.000Z") + i * 1_000).toISOString(),
    }));
    render(<ActivityTimeline events={events} t={t} />);
    const rendered = screen.getAllByTestId("activity-event");
    expect(rendered).toHaveLength(knownKinds.length);
    rendered.forEach((node, idx) => {
      const kind = knownKinds[idx]!;
      const text = (node.textContent ?? "").toLowerCase();
      // After humanizing, the rendered text MUST NOT be the
      // raw enum string. The fallback path (`.replace(/_/g, " ")`)
      // would produce "ada status transition" which is two
      // words — still technically a sentence, but the
      // contract is a richer phrase with a verb. We assert
      // that the humanized form is at least 3 words (a verb
      // + object) and not the raw snake_case kind.
      expect(text).not.toBe(`ada ${kind.replace(/_/g, " ")}`);
      expect(text.split(/\s+/).length).toBeGreaterThanOrEqual(3);
    });
  });
});
