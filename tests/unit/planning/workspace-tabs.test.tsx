import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import {
  WORKSPACE_TAB_ICONS,
  PRIMARY_WORKSPACE_TAB_IDS,
  SECONDARY_WORKSPACE_TAB_IDS,
  WorkspacePanels,
  WorkspaceTabs,
  initialActiveTabFromHash,
  normalizeWorkspaceTabId,
  type WorkspaceTab,
  type WorkspaceTabId,
} from "@/components/planning/workspace-tabs";
import { WorkspaceShell } from "@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/workspace-shell";
import { EMPTY_RESET_IDEA_COUNTS } from "@/lib/content/reset-idea-shared";

// WorkspaceShell's optional operator and discussion surfaces import
// server-action modules. They are not part of this tab-state contract,
// so keep this unit test focused on the shell without loading Auth.js.
vi.mock("@/components/forms/destructive-confirm-dialog", () => ({
  DestructiveConfirmDialog: () => null,
}));
vi.mock("@/components/planning/discussion-drawer", () => ({
  DiscussionDrawer: () => null,
}));
vi.mock("@/app/(app)/app/a/[agencySlug]/w/[slug]/library/actions", () => ({
  duplicateContentItemAction: vi.fn(async () => ({ success: true, newId: "clone-1" })),
}));
vi.mock("@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/actions", () => ({
  archiveContentItemAction: vi.fn(async () => undefined),
  restoreContentItemAction: vi.fn(async () => undefined),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

/**
 * WorkspaceTabs — the in-page tab strip for the content detail
 * page. The contract:
 *  - The visible strip exposes exactly four canonical workspaces:
 *    Overview / Create / Publish / Activity. Legacy panel ids remain grouped
 *    behind those owners, and the Preview surface remains inside Publish.
 *  - Every tab id maps to a Lucide icon — a regression that
 *    adds a tab without an icon fails the contract.
 *  - Only the active panel is rendered (off-tab content
 *    unmounts). This is the contract that makes the editor +
 *    preview + workflow rail stop competing for width.
 *  - URL hash deep-linking works (browser-back returns to
 *    the previous tab).
 */

const tabs: WorkspaceTab[] = [
  { id: "overview", label: "Overview" },
  { id: "create", label: "Create" },
  { id: "publish", label: "Publish" },
  { id: "activity", label: "Activity" },
];

function TabsHost({ initial = "overview" as WorkspaceTabId }) {
  const [value, setValue] = React.useState(initial);
  return (
    <>
      <WorkspaceTabs
        tabs={tabs}
        ariaLabel="Content detail"
        value={value}
        onValueChange={setValue}
      />
      <WorkspacePanels
        value={value}
        panels={{
          overview: <div data-testid="panel-overview">overview</div>,
          "create-basics": <div data-testid="panel-content">content</div>,
          content: <div data-testid="panel-content-legacy">content</div>,
          copy: <div data-testid="panel-copy">copy</div>,
          delivery: <div data-testid="panel-delivery">delivery</div>,
          "publish-settings": <div data-testid="panel-publish-settings">publish settings</div>,
          preview: <div data-testid="panel-preview">preview</div>,
          publishing: <div data-testid="panel-publishing">publishing</div>,
          activity: <div data-testid="panel-activity">activity</div>,
        }}
      />
    </>
  );
}

describe("WorkspaceTabs — four-workspace contract", () => {
  it("keeps the four workspaces primary", () => {
    expect(PRIMARY_WORKSPACE_TAB_IDS).toEqual(["overview", "create", "publish", "activity"]);
    expect(SECONDARY_WORKSPACE_TAB_IDS).toEqual([]);
  });

  it("renders the four canonical workspaces in order", () => {
    render(<TabsHost />);
    expect(screen.getByTestId("workspace-tab-overview")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-tab-create")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-tab-publish")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-tab-activity")).toBeInTheDocument();
  });

  it("resolves an icon for every tab id (no missing-icon regression)", () => {
    for (const t of tabs) {
      expect(WORKSPACE_TAB_ICONS[t.id]).toBeDefined();
    }
  });

  it("renders ONLY the active panel — off-tab content unmounts", () => {
    render(<TabsHost initial="create" />);
    expect(screen.getByTestId("panel-content")).toBeInTheDocument();
    expect(screen.getByTestId("panel-preview").parentElement).toHaveAttribute("hidden");
    expect(screen.getByTestId("panel-publishing").parentElement).toHaveAttribute("hidden");
    expect(screen.queryByTestId("panel-activity")).toBeNull();
  });

  it("switches to the Publish panel when the Publish tab is clicked", async () => {
    const user = userEvent.setup();
    render(<TabsHost initial="create" />);
    await user.click(screen.getByTestId("workspace-tab-publish"));
    expect(screen.getByTestId("panel-publish-settings")).toBeInTheDocument();
    expect(screen.getByTestId("panel-copy").parentElement).toHaveAttribute("hidden");
    // Active tab is reflected in aria-current.
    expect(screen.getByTestId("workspace-tab-publish")).toHaveAttribute("aria-current", "true");
  });

  it("reads the initial active tab from the URL hash on mount", () => {
    window.location.hash = "#publish";
    expect(initialActiveTabFromHash(tabs)).toBe("publish");
    window.location.hash = "";
  });

  it("keeps legacy readiness and workflow hashes backward-compatible", () => {
    const aliases = {
      content: "create",
      "assets-versions": "create",
      delivery: "create",
      copy: "publish",
      preview: "publish",
      publishing: "publish",
      messages: "publish",
      workflow: "overview",
    } as const;

    for (const [alias, canonical] of Object.entries(aliases)) {
      expect(normalizeWorkspaceTabId(alias)).toBe(canonical);
      window.location.hash = `#${alias}`;
      expect(initialActiveTabFromHash(tabs)).toBe(canonical);
    }
    window.location.hash = "";
  });

  it("falls back to the first tab when the hash is not a known tab id", () => {
    window.location.hash = "#not-a-tab";
    expect(initialActiveTabFromHash(tabs)).toBe("overview");
    window.location.hash = "";
  });
});

describe("WorkspaceShell — initial hash handoff", () => {
  it("opens the operator menu in a portal above the workspace panel", async () => {
    const user = userEvent.setup();

    render(
      <WorkspaceShell
        workspaceSlug="acme"
        contentItemId="content-1"
        ideaTitle="Summer launch"
        comments={[]}
        currentUserId="user-1"
        roles={{
          isManager: true,
          isPlanner: false,
          isDesigner: false,
          isInternalReviewer: false,
          isClientReviewer: false,
          isPublisher: false,
        }}
        canPostInternal={true}
        canPostClientVisible={false}
        tabs={tabs}
        panels={{
          overview: <div data-testid="shell-panel-overview">overview</div>,
        }}
        canResetIdea={true}
        resetCounts={EMPTY_RESET_IDEA_COUNTS}
        activityCount={0}
        openCommentCount={0}
        mentionCount={0}
        canManageContentActions={true}
        sourceFormat="long_form_video"
      />,
    );

    const trigger = screen.getByTestId("workspace-overflow-trigger");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");

    await user.click(trigger);

    const menu = screen.getByTestId("workspace-overflow-content");
    expect(menu).toBeInTheDocument();
    const portal = menu.closest("[data-radix-popper-content-wrapper]");
    expect(portal?.parentElement).toBe(document.body);
    expect(screen.getByRole("menuitem", { name: "Reset content" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Create replacement draft" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Create replacement draft" }));
    expect(screen.getByTestId("replacement-draft-dialog")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Long-form video" })).not.toBeInTheDocument();
  });

  it("keeps a user-selected tab after hydration has finished", async () => {
    window.location.hash = "";
    const user = userEvent.setup();

    render(
      <WorkspaceShell
        workspaceSlug="acme"
        contentItemId="content-1"
        ideaTitle="Summer launch"
        comments={[]}
        currentUserId="user-1"
        roles={{
          isManager: false,
          isPlanner: true,
          isDesigner: false,
          isInternalReviewer: false,
          isClientReviewer: false,
          isPublisher: false,
        }}
        canPostInternal={true}
        canPostClientVisible={false}
        tabs={tabs}
        panels={{
          overview: <div data-testid="shell-panel-overview">overview</div>,
          content: <div data-testid="shell-panel-content">content</div>,
          preview: <div data-testid="shell-panel-preview">preview</div>,
          publishing: <div data-testid="shell-panel-publishing">publishing</div>,
          activity: <div data-testid="shell-panel-activity">activity</div>,
        }}
        canResetIdea={false}
        resetCounts={EMPTY_RESET_IDEA_COUNTS}
        activityCount={0}
        openCommentCount={0}
        mentionCount={0}
      />,
    );

    await user.click(screen.getByTestId("workspace-tab-publish"));

    expect(screen.getByTestId("shell-panel-publishing")).toBeInTheDocument();
    expect(screen.queryByTestId("shell-panel-overview")).toBeNull();
    expect(window.location.hash).toBe("#publish");
  });
});
