import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  DesignQueueList,
  type DesignQueueListItem,
} from "@/app/(app)/app/w/[slug]/design-queue/design-queue-list";
import { tFor } from "@/messages";

const t = tFor("en");

// The list component calls `useRouter()` so the bulk-archive
// toolbar can `router.refresh()` after a successful mutation.
// jsdom does not implement navigation; the test only
// exercises the read path, so a no-op router is fine.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// The bulk toolbar transitively pulls in next-auth, which
// is not jsdom-friendly in the test runner. The test only
// exercises the read path (canBulkArchive: false), so the
// toolbar never renders — stub it to a no-op.
vi.mock("@/app/(app)/app/w/[slug]/design-queue/bulk-toolbar", () => ({
  DesignQueueBulkToolbar: () => null,
}));

/**
 * /ui-ux-pro-max P3.2 — the design queue must answer
 * "what creative work can / should a designer pick up?",
 * not "which items are unassigned?". The contract:
 *  - Each card surfaces format, brief excerpt, brief
 *    readiness, owner, status, and the planned publish
 *    date as the "Required by" deadline.
 *  - A missing brief is discoverable (italic "Brief not
 *    ready" + a warning pill) so a designer can see
 *    which items are unclaimable until the planner
 *    tightens the brief.
 *  - The owner is the content owner (the planner who
 *    queued the work), not the (absent) designer.
 *  - Missing owner renders italic "Unassigned" — same
 *    `data-empty` contract as the planning list's
 *    PeopleCell.
 */

function makeItem(overrides: Partial<DesignQueueListItem> = {}): DesignQueueListItem {
  return {
    id: "item-1",
    title: "August Challenge Launch",
    status: "approved_for_design",
    plannedPublishAtIso: "2026-08-31T10:00:00.000Z",
    href: "/app/w/acme/planning/item-1",
    format: "carousel",
    briefExcerpt: "Launch the August challenge: 3 angles, one slide each, end with a CTA.",
    ownerDisplayName: "Ghaleb K.",
    updatedAtIso: "2026-08-29T10:00:00.000Z",
    briefIsEmpty: false,
    ...overrides,
  };
}

describe("DesignQueueList — designer-facing context (P3.2)", () => {
  it("renders format + title + 'Required by' + brief + owner + status for a brief-ready item", () => {
    render(<DesignQueueList workspaceId="ws" items={[makeItem()]} canBulkArchive={false} t={t} />);
    const card = screen.getByTestId("design-queue-row");
    expect(within(card).getByTestId("design-queue-row-format")).toHaveTextContent("Carousel");
    expect(within(card).getByTestId("design-queue-row-required-by")).toHaveTextContent(
      /Required by/,
    );
    expect(within(card).getByTestId("design-queue-row-brief")).toHaveTextContent(
      /Launch the August challenge/,
    );
    expect(within(card).getByTestId("design-queue-row-owner")).toHaveTextContent("Ghaleb K.");
    // Brief-ready pill (success tone, "Brief ready" label).
    const briefStatus = within(card).getByTestId("design-queue-row-brief-status");
    expect(briefStatus).toHaveAttribute("data-brief-ready", "true");
    expect(briefStatus).toHaveTextContent("Brief ready");
  });

  it("renders italic 'Brief not ready' + warning pill when the brief is empty", () => {
    render(
      <DesignQueueList
        workspaceId="ws"
        items={[
          makeItem({
            id: "empty-brief",
            title: "Empty brief item",
            briefExcerpt: null,
            briefIsEmpty: true,
          }),
        ]}
        canBulkArchive={false}
        t={t}
      />,
    );
    const card = screen.getByTestId("design-queue-row");
    expect(within(card).getByTestId("design-queue-row-brief")).toHaveTextContent(/Brief not ready/);
    const briefStatus = within(card).getByTestId("design-queue-row-brief-status");
    expect(briefStatus).toHaveAttribute("data-brief-ready", "false");
    expect(briefStatus).toHaveTextContent("Brief needed");
  });

  it("renders italic 'Unassigned' for the owner when no planner is attached", () => {
    render(
      <DesignQueueList
        workspaceId="ws"
        items={[makeItem({ ownerDisplayName: null })]}
        canBulkArchive={false}
        t={t}
      />,
    );
    const owner = screen.getByTestId("design-queue-row-owner");
    expect(owner).toHaveAttribute("data-empty", "true");
    expect(owner).toHaveTextContent(/Owner/);
    expect(owner).toHaveTextContent(/Unassigned/);
  });

  it("does not show the brief excerpt as the placeholder text when the brief is filled", () => {
    render(
      <DesignQueueList
        workspaceId="ws"
        items={[makeItem({ briefExcerpt: "A real brief" })]}
        canBulkArchive={false}
        t={t}
      />,
    );
    const brief = screen.getByTestId("design-queue-row-brief");
    expect(brief.textContent).toContain("A real brief");
    expect(brief.textContent).not.toContain("Brief not ready");
  });
});
