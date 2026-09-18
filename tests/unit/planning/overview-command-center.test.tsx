import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { OverviewCommandCenter } from "@/components/planning/overview-command-center";
import { tFor } from "@/messages";

vi.mock("@/lib/content/inline-update", () => ({
  inlineUpdateBriefAction: vi.fn(async () => ({ ok: true as const })),
  inlineUpdateTitleAction: vi.fn(async () => ({ ok: true as const })),
  inlineUpdateDateAction: vi.fn(async () => ({ ok: true as const })),
}));

const t = tFor("en");

/**
 * The OverviewCommandCenter is the at-a-glance summary that
 * lives under the `Overview` tab. It must:
 *   1. Render a Next Action card when something needs attention
 *      (blockers, changes_requested, draft, etc).
 *   2. Render one compact readiness summary without a duplicate issue list.
 *   3. Render linked workspace snapshots.
 *   4. Render the latest activity events with a "View all" link.
 *   5. Hide the Next Action card when the item is fully ready.
 *   6. Not duplicate the editor surface (no Brief editor here).
 *
 * The tests are unit-level — no real data fetching. The parent
 * server page passes plain data in.
 */

const baseProps = {
  workspaceSlug: "acme",
  contentItemId: "ci-1",
  contentStatus: "draft",
  // Phase 6 of the planning-detail refactor (2026-08-30):
  // `title` / `brief` / `plannedPublishAtIso` were added to
  // `OverviewCommandCenterProps` when the old "Basic
  // information" block moved into the Overview's
  // `DetailsSection`.
  title: "Happy Hour 2",
  brief: "Summer teaser",
  format: "static_post",
  plannedPublishAt: "2026-09-01 09:00",
  plannedPublishAtIso: "2026-09-01T07:00:00.000Z",
  workspaceTimezone: "Europe/Berlin",
  channels: [{ id: "ch-1", platform: "instagram", accountName: "Acme Main", configured: true }],
  ownerName: "Ada Lovelace",
  readinessBlockers: 0,
  readinessCanPublish: false,
  readiness: [
    {
      id: "content",
      label: "Content",
      status: "warning" as const,
      detail: "Brief is empty",
      href: "#content",
    },
    {
      // Phase 3 of the planning-detail refactor (2026-08-30)
      // renamed the "Creative" row to "Assets & versions" and
      // moved its anchor inside the Content tab. The test
      // follows the page contract.
      id: "assets-versions",
      label: "Assets & versions",
      status: "neutral" as const,
      detail: "No design versions yet",
      href: "#assets-versions",
    },
    {
      id: "publishing",
      label: "Publishing",
      status: "ready" as const,
      detail: "Channels configured",
      href: "#publishing",
    },
    {
      id: "schedule",
      label: "Schedule",
      status: "ready" as const,
      detail: "On schedule",
      href: "#publishing",
    },
  ],
  deliveryCount: 0,
  finalApprovedCount: 0,
  recentActivity: [],
  totalActivityCount: 0,
  canEdit: true,
  editHref: "/app/w/acme/planning/edit/ci-1",
  t,
};

describe("OverviewCommandCenter", () => {
  it("renders a compact readiness summary and linked workspace snapshots", () => {
    render(<OverviewCommandCenter {...baseProps} />);
    expect(screen.getByTestId("overview-readiness-summary")).toHaveTextContent(
      "2 of 4 areas ready",
    );
    expect(screen.queryByTestId("overview-readiness-list")).toBeNull();
    expect(screen.getByTestId("overview-snapshot-brief")).toHaveAttribute("href", "#content");
    expect(screen.getByTestId("overview-snapshot-copy")).toHaveAttribute("href", "#copy");
    expect(screen.getByTestId("overview-snapshot-assets")).toHaveAttribute("href", "#delivery");
    expect(screen.getByTestId("overview-snapshot-publish")).toHaveAttribute("href", "#publishing");
  });

  it("renders the Next Action card for a draft item with blockers", () => {
    render(
      <OverviewCommandCenter
        {...baseProps}
        contentStatus="changes_requested"
        readinessBlockers={1}
        primaryActionLabel="Review changes"
        // Phase 3 (2026-08-30): the review-changes anchor moved
        // inside the Content tab as "Assets & versions".
        reviewChangesHref="#assets-versions"
      />,
    );
    const card = screen.getByTestId("overview-next-action");
    expect(card).toBeInTheDocument();
    // The right rail now owns the primary workflow transition
    // action. The Overview's Action Required card therefore
    // intentionally does NOT render a CTA button — the user
    // gets a single obvious primary action in the rail, not
    // two competing ones. We assert the CTA is gone here.
    expect(screen.queryByTestId("overview-next-action-cta")).toBeNull();
    expect(screen.getByTestId("overview-next-action")).not.toHaveTextContent("blocker to publish");
  });

  it("keeps future publishing checks out of the compact readiness summary", () => {
    render(
      <OverviewCommandCenter
        {...baseProps}
        contentStatus="draft"
        readinessBlockers={2}
        readiness={baseProps.readiness.map((row) => ({
          ...row,
          status: "warning" as const,
          detail: "Will be checked before publishing",
        }))}
      />,
    );

    expect(screen.getByTestId("overview-readiness-summary")).toHaveTextContent(
      "0 of 4 areas ready",
    );
    expect(screen.queryByTestId("overview-readiness-future-checks")).toBeNull();
    expect(screen.getByTestId("overview-next-action")).toHaveTextContent(
      "Ready to submit for review",
    );
  });

  it("hides the Next Action card when the item is fully ready", () => {
    render(
      <OverviewCommandCenter
        {...baseProps}
        contentStatus="published"
        readinessBlockers={0}
        readinessCanPublish={true}
        readiness={baseProps.readiness.map((r) => ({
          ...r,
          status: "ready" as const,
          detail: "OK",
        }))}
      />,
    );
    expect(screen.queryByTestId("overview-next-action")).toBeNull();
  });

  it("renders a Recent Activity preview with View-all link when more events exist", () => {
    render(
      <OverviewCommandCenter
        {...baseProps}
        recentActivity={[
          {
            id: "e-1",
            kind: "status_transition",
            summary: "moved the workflow forward",
            actorName: "Mohamad",
            occurredAt: new Date().toISOString(),
            metadata: null,
          },
        ]}
        totalActivityCount={5}
      />,
    );
    expect(screen.getByTestId("overview-recent-activity")).toBeInTheDocument();
    expect(screen.getByTestId("overview-view-all-activity")).toBeInTheDocument();
  });

  it("renders the empty state when no recent activity", () => {
    render(<OverviewCommandCenter {...baseProps} />);
    expect(screen.getByTestId("overview-recent-activity-empty")).toBeInTheDocument();
  });

  it("localizes compact readiness and snapshots", () => {
    render(<OverviewCommandCenter {...baseProps} t={tFor("ar")} />);
    expect(screen.getByTestId("overview-readiness-summary")).toHaveTextContent(
      "2 من أصل 4 مناطق جاهزة",
    );
    expect(screen.getByTestId("overview-snapshot-copy")).toHaveTextContent("المصدر المشترك");
  });
});

/**
 * Regression tests for the "Go to" links on the Overview tab.
 *
 * Background (2026-09-18): planners reported that the
 * `Brief / Copy / Shared source / Assets / Publish` cards on
 * the Overview tab updated the URL hash when clicked but the
 * workspace tab stayed on `Overview`. The cause was that
 * Next.js's client-side `<Link>` does not fire the browser's
 * native `hashchange` event for same-page hash navigation —
 * the `WorkspaceShell` listener that updates `activeId` never
 * fired.
 *
 * The fix replaces the snapshot / next-action / view-all
 * `<Link>` instances with `<TabSwitchLink>` (which dispatches
 * a synthetic `hashchange`). The regression tests below
 * assert each fixed instance dispatches the event so the
 * shell can react.
 */
describe("OverviewCommandCenter — Go-to navigation wires hashchange", () => {
  beforeEach(() => {
    // Anchor the test window to the planning detail path so
    // TabSwitchLink's `isHashOnlyLink` check accepts hash-only
    // hrefs as in-page (not cross-page) navigation.
    window.history.replaceState(null, "", "/app/w/acme/planning/ci-1");
    window.location.hash = "";
  });

  it("the four workspace snapshot cards fire hashchange so WorkspaceShell can switch tabs", () => {
    const listener = vi.fn();
    window.addEventListener("hashchange", listener);
    render(<OverviewCommandCenter {...baseProps} />);

    // Each card is a real <a href="#…"> — the click must be
    // observable through the standard anchor + preventDefault
    // path TabSwitchLink uses.
    const targets: Array<[string, string]> = [
      ["overview-snapshot-brief", "#content"],
      ["overview-snapshot-copy", "#copy"],
      ["overview-snapshot-assets", "#delivery"],
      ["overview-snapshot-publish", "#publishing"],
    ];

    for (const [testId, expectedHash] of targets) {
      listener.mockClear();
      window.location.hash = ""; // reset between iterations
      const link = screen.getByTestId(testId);
      act(() => {
        fireEvent.click(link);
      });
      expect(link.tagName).toBe("A");
      expect(link).toHaveAttribute("href", expectedHash);
      expect(window.location.hash).toBe(expectedHash);
      expect(listener).toHaveBeenCalledTimes(1);
    }

    window.removeEventListener("hashchange", listener);
  });

  it("the Next Action destination link fires hashchange", () => {
    const listener = vi.fn();
    window.addEventListener("hashchange", listener);
    render(
      <OverviewCommandCenter
        {...baseProps}
        contentStatus="changes_requested"
        readinessBlockers={1}
        primaryActionLabel="Review changes"
        nextActionDestinationTab="content"
        nextActionExecutable={true}
      />,
    );

    const dest = screen.getByTestId("overview-next-action-destination");
    act(() => {
      fireEvent.click(dest);
    });

    expect(dest).toHaveAttribute("href", "#content");
    expect(window.location.hash).toBe("#content");
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener("hashchange", listener);
  });

  it("the Recent Activity 'View all' link fires hashchange", () => {
    const listener = vi.fn();
    window.addEventListener("hashchange", listener);
    render(
      <OverviewCommandCenter
        {...baseProps}
        recentActivity={[
          {
            id: "e-1",
            kind: "status_transition",
            summary: "moved the workflow forward",
            actorName: "Mohamad",
            occurredAt: new Date().toISOString(),
            metadata: null,
          },
        ]}
        totalActivityCount={5}
      />,
    );

    const viewAll = screen.getByTestId("overview-view-all-activity");
    act(() => {
      fireEvent.click(viewAll);
    });

    expect(viewAll).toHaveAttribute("href", "#activity");
    expect(window.location.hash).toBe("#activity");
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener("hashchange", listener);
  });
});
