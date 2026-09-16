import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanningHeader } from "@/components/planning/planning-header";

// Mock the inline-editable-fields module so the test doesn't pull in
// the next-auth module chain (next-auth currently has a pre-existing
// `next/server` import issue with Next 16 that prevents the test
// file from loading when this dependency tree is reached).
// The PlanningHeader test doesn't exercise the date editor itself
// — it only checks the header chrome — so a stub is sufficient.
vi.mock("@/app/(app)/app/w/[slug]/planning/[id]/inline-editable-fields", () => ({
  InlineDateEditor: () => null,
  InlineBriefEditor: () => null,
  InlineTitleEditor: () => null,
}));

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
        plannedPublishAtIso="2026-09-01T09:00:00.000Z"
        canEdit={true}
        canTrash={false}
        editHref="/app/w/acme/planning/ci-1/edit"
      />,
    );
    expect(screen.getByText("Spring drop teaser")).toBeInTheDocument();
    expect(screen.getByText("Static Post")).toBeInTheDocument();
    expect(screen.getByText("2 channels")).toBeInTheDocument();
    expect(screen.getByText(/2026-09-01 09:00/i)).toBeInTheDocument();
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
        plannedPublishAtIso="2026-09-01T09:00:00.000Z"
        canEdit={true}
        canTrash={false}
        editHref="/app/w/acme/planning/ci-1/edit"
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
        plannedPublishAtIso="2026-09-01T09:00:00.000Z"
        canEdit={true}
        canTrash={false}
        editHref="/app/w/acme/planning/ci-1/edit"
      />,
    );
    expect(screen.getByText("منشور ثابت")).toBeInTheDocument();
    expect(screen.getByText("التخطيط")).toBeInTheDocument();
    expect(screen.getByText("القنوات: 0")).toBeInTheDocument();
  });

  it("keeps lifecycle actions out of the compact header", () => {
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
        plannedPublishAtIso="2026-09-01T09:00:00.000Z"
        canEdit={true}
        canTrash={false}
        editHref="/app/w/acme/planning/ci-1/edit"
      />,
    );
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
    expect(screen.queryByTestId("planning-header-owner")).toBeNull();
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
        plannedPublishAtIso="2026-09-01T09:00:00.000Z"
        canEdit={true}
        canTrash={false}
        editHref="/app/w/acme/planning/ci-1/edit"
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
        plannedPublishAtIso="2026-09-01T09:00:00.000Z"
        canEdit={true}
        canTrash={false}
        editHref="/app/w/acme/planning/ci-1/edit"
      />,
    );
    expect(screen.getByTestId("planning-header-breadcrumb")).toHaveTextContent(
      "العودة إلى التخطيط",
    );
  });
});
