import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { OverviewCommandCenter } from "@/components/planning/overview-command-center";

/**
 * The OverviewCommandCenter is the at-a-glance summary that
 * lives under the `Overview` tab. It must:
 *   1. Render a Next Action card when something needs attention
 *      (blockers, changes_requested, draft, etc).
 *   2. Render a 4-line readiness list (Content / Creative /
 *      Publishing / Schedule) with deep links to each section.
 *   3. Render a content summary (format, channels, planned date).
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
  format: "static_post",
  plannedPublishAt: "2026-09-01 09:00",
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
      id: "creative",
      label: "Creative",
      status: "neutral" as const,
      detail: "No delivery versions yet",
      href: "#creative",
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
};

describe("OverviewCommandCenter", () => {
  it("renders the four readiness rows with deep links", () => {
    render(<OverviewCommandCenter {...baseProps} />);
    const list = screen.getByTestId("overview-readiness-list");
    expect(list).toBeInTheDocument();
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    // The Content row should be a link to #content
    const contentLink = within(list).getByTestId("overview-readiness-link-content");
    expect(contentLink).toHaveAttribute("href", "#content");
    // The Creative row should be a link to #creative
    const creativeLink = within(list).getByTestId("overview-readiness-link-creative");
    expect(creativeLink).toHaveAttribute("href", "#creative");
  });

  it("renders the Next Action card for a draft item with blockers", () => {
    render(
      <OverviewCommandCenter
        {...baseProps}
        contentStatus="changes_requested"
        readinessBlockers={1}
        primaryActionLabel="Review changes"
        reviewChangesHref="#creative"
      />,
    );
    const card = screen.getByTestId("overview-next-action");
    expect(card).toBeInTheDocument();
    const cta = screen.getByTestId("overview-next-action-cta");
    expect(cta).toHaveTextContent(/Review changes/);
    expect(cta).toHaveAttribute("href", "#creative");
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

  it("does not render the inline brief editor", () => {
    render(<OverviewCommandCenter {...baseProps} />);
    // Overview is a command center, not an editor. The brief
    // editor is rendered under the Content tab.
    expect(screen.queryByTestId("open-full-edit")).toBeNull();
  });

  it("renders the content summary with format, channels, and date", () => {
    render(<OverviewCommandCenter {...baseProps} />);
    const summary = screen.getByTestId("overview-content-summary-list");
    expect(within(summary).getByText("Static Post")).toBeInTheDocument();
    expect(within(summary).getByText(/Acme Main/)).toBeInTheDocument();
    expect(within(summary).getByText(/2026-09-01 09:00/)).toBeInTheDocument();
  });
});
