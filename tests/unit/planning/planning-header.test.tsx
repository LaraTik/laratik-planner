import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanningHeader } from "@/components/planning/planning-header";

describe("PlanningHeader", () => {
  it("renders the title, format, channels, planned date, and status badge", () => {
    render(
      <PlanningHeader
        workspaceSlug="acme"
        workspaceName="Acme"
        workspaceTimezone="Europe/Berlin"
        contentItemId="ci-1"
        title="Spring drop teaser"
        format="static_post"
        status="ready_to_publish"
        channels={[
          { platform: "instagram", accountName: "Acme Main" },
          { platform: "tiktok", accountName: "Acme TikTok" },
        ]}
        plannedPublishAt="2026-09-01 09:00"
        owner={{ id: "u-1", displayName: "Ada Lovelace" }}
      />,
    );
    expect(screen.getByText("Spring drop teaser")).toBeInTheDocument();
    expect(screen.getByText("Static Post")).toBeInTheDocument();
    expect(screen.getByText("2 channels")).toBeInTheDocument();
    expect(screen.getByText(/2026-09-01 09:00/i)).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Ready To Publish")).toBeInTheDocument();
  });

  it("shows 'No channels' when the channel list is empty", () => {
    render(
      <PlanningHeader
        workspaceSlug="acme"
        workspaceName="Acme"
        workspaceTimezone="Europe/Berlin"
        contentItemId="ci-1"
        title="Title"
        format="static_post"
        status="draft"
        channels={[]}
        plannedPublishAt="2026-09-01 09:00"
      />,
    );
    expect(screen.getByText("No channels")).toBeInTheDocument();
  });

  it("uses page-resolved labels for localized detail headers", () => {
    render(
      <PlanningHeader
        workspaceSlug="acme"
        workspaceName="Acme"
        workspaceTimezone="Europe/Berlin"
        contentItemId="ci-1"
        title="عنوان الحملة"
        format="static_post"
        formatLabel="منشور ثابت"
        status="draft"
        statusLabel="التخطيط"
        channels={[]}
        channelsSummary="القنوات: 0"
        plannedPublishAt="2026-09-01 09:00"
      />,
    );
    expect(screen.getByText("منشور ثابت")).toBeInTheDocument();
    expect(screen.getByText("التخطيط")).toBeInTheDocument();
    expect(screen.getByText("القنوات: 0")).toBeInTheDocument();
  });

  it("renders the primary action slot when provided", () => {
    render(
      <PlanningHeader
        workspaceSlug="acme"
        workspaceName="Acme"
        workspaceTimezone="Europe/Berlin"
        contentItemId="ci-1"
        title="Title"
        format="static_post"
        status="draft"
        channels={[]}
        plannedPublishAt="2026-09-01 09:00"
        primaryAction={<a href="/x">Edit</a>}
      />,
    );
    expect(screen.getByRole("link", { name: "Edit" })).toBeInTheDocument();
  });

  it("links the breadcrumb back to the workspace's planning list", () => {
    render(
      <PlanningHeader
        workspaceSlug="acme"
        workspaceName="Acme"
        workspaceTimezone="Europe/Berlin"
        contentItemId="ci-1"
        title="Title"
        format="static_post"
        status="draft"
        channels={[]}
        plannedPublishAt="2026-09-01 09:00"
      />,
    );
    const breadcrumb = screen.getByTestId("planning-header-breadcrumb");
    expect(breadcrumb).toHaveAttribute("href", "/app/w/acme/planning");
  });

  it("accepts a locale-resolved breadcrumb label", () => {
    render(
      <PlanningHeader
        workspaceSlug="acme"
        workspaceName="Acme"
        workspaceTimezone="Europe/Berlin"
        contentItemId="ci-1"
        title="Title"
        backLabel="العودة إلى التخطيط"
        format="static_post"
        status="draft"
        channels={[]}
        plannedPublishAt="2026-09-01 09:00"
      />,
    );
    expect(screen.getByTestId("planning-header-breadcrumb")).toHaveTextContent(
      "العودة إلى التخطيط",
    );
  });
});
