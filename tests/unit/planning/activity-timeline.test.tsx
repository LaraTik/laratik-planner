import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ActivityTimeline, type ActivityEventView } from "@/components/planning/activity-timeline";
import { tFor } from "@/messages";

const t = tFor("en");

// 2026-09-27: the per-item timeline moved to the shared
// `<ActivityEntry />` + `formatActivityEvent` formatter. The
// tests below pin the new contract:
//   - events with `targetLabel` + `beforeData` / `afterData`
//     render through the verb templates and the before/after
//     diff chip.
//   - events without structured data render the localised
//     fallback ("(deleted item)"), never the raw enum.

const EVENTS: ActivityEventView[] = [
  {
    id: "ev-1",
    kind: "status_transition",
    summary: "draft → content review",
    actorName: "Ada Lovelace",
    occurredAt: "2026-08-29T10:00:00.000Z",
    targetLabel: "Spring drop",
    beforeData: { status: "draft" },
    afterData: { status: "content_review" },
  },
  {
    id: "ev-2",
    kind: "brief_updated",
    summary: "Updated the brief inline",
    actorName: "Grace Hopper",
    occurredAt: "2026-08-29T11:00:00.000Z",
    targetLabel: "Spring drop",
    beforeData: { brief: "old brief" },
    afterData: { brief: "new brief" },
  },
];

describe("ActivityTimeline", () => {
  it("renders each event with actor and target", () => {
    render(<ActivityTimeline events={EVENTS} t={t} />);
    const items = screen.getAllByTestId("activity-event");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Ada Lovelace");
    expect(items[0]).toHaveTextContent("Spring drop");
    expect(items[1]).toHaveTextContent("Grace Hopper");
  });

  it("renders the localised verb template", () => {
    render(<ActivityTimeline events={EVENTS} t={t} />);
    // The verb for `status_transition` is "moved {target} from {before} to {after}"
    // → "moved Spring drop from Draft to Content review". The text
    // spans several `<bdi>` elements so we test the joined text
    // instead of a single element.
    const items = screen.getAllByTestId("activity-event");
    const text = (items[0]?.textContent ?? "").toLowerCase();
    expect(text).toContain("moved");
    expect(text).toContain("spring drop");
    expect(text).toContain("from");
    expect(text).toContain("draft");
    expect(text).toContain("to");
    expect(text).toContain("content review");
  });

  it("renders a text-shaped diff for brief updates", () => {
    render(<ActivityTimeline events={EVENTS} t={t} />);
    const ev2 = screen.getAllByTestId("activity-event")[1]!;
    // Old brief is in a <del> (strikethrough), new brief in
    // an <ins> (underline). The shared diff primitive emits
    // both into the row.
    const beforeNode = within(ev2).getByTestId("activity-diff-before");
    const afterNode = within(ev2).getByTestId("activity-diff-after");
    expect(beforeNode).toHaveTextContent("old brief");
    expect(afterNode).toHaveTextContent("new brief");
  });

  it("falls back to a kind-based humanised verb when no structured data is given", () => {
    render(
      <ActivityTimeline
        t={t}
        events={[
          {
            id: "ev-1",
            kind: "delivery",
            summary: "",
            actorName: "Ada",
            occurredAt: "2026-08-29T10:00:00.000Z",
            targetLabel: "Spring drop",
          },
        ]}
      />,
    );
    // Verb template `activity.verbs.delivery` is
    // "delivered {metadata} for {target}" — without metadata
    // the metadata slot collapses, leaving "delivered for …".
    const item = screen.getAllByTestId("activity-event")[0]!;
    const text = (item.textContent ?? "").toLowerCase();
    expect(text).toContain("delivered");
    expect(text).toContain("spring drop");
  });

  it("renders an empty state when no events are passed", () => {
    render(<ActivityTimeline events={[]} t={t} />);
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
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

  // The new contract: every kind in the vocabulary renders a
  // non-empty verb (>= 3 words) and never leaks the raw enum.
  // No machine enum string reaches the user.
  //
  // 2026-09-27: the kind list is now the canonical
  // `activityKindEnum` from `lib/db/schema/enums.ts`. The old
  // test asserted a wider list (comment_added, mention,
  // claimed, etc.) that predates the shared formatter; those
  // values never appear in `activity_event.kind`.
  it("renders a verb for every known kind without leaking the raw enum", () => {
    const knownKinds = [
      "create",
      "update",
      "schedule_change",
      "assignment",
      "status_transition",
      "comment",
      "review",
      "approval_reset",
      "delivery",
      "publication",
      "archive",
      "restore",
      "invitation",
      "ai_assistance",
      "delete",
      "bulk_delete",
      "content_copy_patched",
    ];
    const events: ActivityEventView[] = knownKinds.map((k, i) => ({
      id: `ev-${k}`,
      kind: k,
      summary: "",
      actorName: "Ada",
      occurredAt: new Date(Date.parse("2026-08-29T10:00:00.000Z") + i * 1_000).toISOString(),
      targetLabel: "Spring drop",
    }));
    render(<ActivityTimeline events={events} t={t} />);
    const rendered = screen.getAllByTestId("activity-event");
    expect(rendered).toHaveLength(knownKinds.length);
    rendered.forEach((node, idx) => {
      const kind = knownKinds[idx]!;
      const text = (node.textContent ?? "").toLowerCase();
      // The verb + target + actor should be at least 3 words —
      // proves we render a real phrase, not just the enum.
      expect(text.split(/\s+/).length).toBeGreaterThanOrEqual(3);
      // The raw snake_case kind MUST NOT appear in machine-y
      // positions (between brackets, prefixed with a colon).
      // Verb templates like "created" or "review" can legitimately
      // share words with the enum — what matters is the user
      // doesn't see "{kind}: something".
      expect(text).not.toMatch(new RegExp(`\\[${kind}\\]`));
      expect(text).not.toMatch(new RegExp(`${kind}\\s*:`));
      // The data-event-kind attribute is still the raw enum —
      // that one is intentional for filter tests.
      expect(node.getAttribute("data-event-kind")).toBe(kind);
    });
  });
});
