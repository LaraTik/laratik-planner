import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "@/components/app-shell/sidebar";

// next/navigation's usePathname + useRouter are client hooks. We stub
// usePathname per-test via vi.mock so the same suite can exercise
// both the global-mode and workspace-mode branches of the
// workspace-aware sidebar. useRouter is also stubbed because the
// embedded WorkspaceSwitcher uses it for the popover's selection.
const usePathnameMock = vi.fn<() => string>(() => "/app");
const pushMock = vi.fn<(href: string) => void>(() => {});
const refreshMock = vi.fn<() => void>(() => {});
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));
// next/link is fine in jsdom; nothing extra to stub.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

const baseProps = {
  user: { name: "Lara", isAdmin: false },
  workspaces: [
    { id: "ws-1", name: "Northstar Coffee", slug: "northstar" },
    { id: "ws-2", name: "Autumn Blend", slug: "autumn" },
  ],
  workspaceSwitcherOptions: [
    { id: "ws-1", name: "Northstar Coffee", slug: "northstar" },
    { id: "ws-2", name: "Autumn Blend", slug: "autumn" },
  ],
  workspaceCanCreateContent: { "ws-1": true, "ws-2": true },
  agencySwitcher: {
    active: { id: "agency-1", name: "Test Agency", slug: "test-agency", isAdmin: true },
    options: [{ id: "agency-1", name: "Test Agency", slug: "test-agency", isAdmin: true }],
  },
  canCreateWorkspace: false,
  platformAccess: {
    canEnter: false,
    canReadAgencies: false,
    canReadSecurity: false,
    canReadAccess: false,
  },
};

const ownerAccess = {
  canEnter: true,
  canReadAgencies: true,
  canReadSecurity: true,
  canReadAccess: true,
};

describe("Sidebar (workspace-aware)", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
  });

  it("renders the global nav when the user is on a global page", () => {
    usePathnameMock.mockReturnValue("/app");
    render(<Sidebar {...baseProps} />);
    expect(screen.getByRole("link", { name: "My work" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Workspaces" })).toBeInTheDocument();
    // Workspace tabs are NOT rendered in global mode
    expect(screen.queryByRole("link", { name: "Overview" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Planning" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Calendar" })).toBeNull();
    // "Create content" CTA is NOT shown in global mode
    expect(screen.queryByTestId("sidebar-create-content")).toBeNull();
  });

  it("keeps global context neutral instead of marking the first workspace active", () => {
    usePathnameMock.mockReturnValue("/app/workspaces");
    render(<Sidebar {...baseProps} />);

    const context = screen.getByTestId("sidebar-context-switchers");
    const workspace = screen.getByTestId("sidebar-workspace-switcher-trigger");
    expect(context).toContainElement(screen.getByTestId("sidebar-agency-switcher-trigger"));
    expect(workspace).toHaveAttribute("aria-label", "Select a workspace. Click to open.");
    expect(workspace).toHaveTextContent("Select workspace");
  });

  it("keeps the tablet rail visually icon-only even when desktop sidebar is expanded", () => {
    usePathnameMock.mockReturnValue("/app");
    render(<Sidebar {...baseProps} />);

    // AppShell uses a 72px rail below xl. Labels remain in the DOM for
    // accessible names, but must not paint into the page at tablet widths.
    expect(screen.getByText("StudioFlow").parentElement).toHaveClass("hidden", "xl:block");
    const myWorkLabel = Array.from(
      screen.getByRole("link", { name: "My work" }).querySelectorAll("span"),
    ).find((span) => span.textContent === "My work");
    expect(myWorkLabel).toHaveClass("hidden", "xl:block");
  });

  it("hides admin items in the sidebar when the user is not an admin (global mode)", () => {
    usePathnameMock.mockReturnValue("/app");
    render(<Sidebar {...baseProps} user={{ name: "Lara", isAdmin: false }} />);
    expect(screen.queryByRole("link", { name: /User Management/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Agency Settings/i })).toBeNull();
  });

  it("shows admin items in the sidebar when the user is an admin (global mode)", async () => {
    usePathnameMock.mockReturnValue("/app");
    const user = userEvent.setup();
    render(<Sidebar {...baseProps} user={{ name: "Lara", isAdmin: true }} canAccessTrendRadar />);
    await user.click(screen.getByRole("button", { name: "Expand Agency settings" }));
    expect(screen.getByRole("link", { name: /User Management/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Agency Settings/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Trend sources/i })).toHaveAttribute(
      "href",
      "/app/agency-settings/trend-sources",
    );
  });

  it("shows plan usage to agency admins and platform console only to platform admins", () => {
    usePathnameMock.mockReturnValue("/app/agency-settings/plan");
    const { rerender } = render(<Sidebar {...baseProps} user={{ name: "Lara", isAdmin: true }} />);
    expect(screen.getByRole("link", { name: /Plan and usage/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Social analytics/i })).toHaveAttribute(
      "href",
      "/app/agency-settings/social",
    );
    expect(screen.getByRole("link", { name: /Social provider setup/i })).toHaveAttribute(
      "href",
      "/app/agency-settings/social/providers",
    );
    expect(screen.getByRole("link", { name: /Social provider setup/i })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: /Media storage/i })).toHaveAttribute(
      "href",
      "/app/agency-settings/storage",
    );
    expect(screen.queryByRole("link", { name: /Platform overview/i })).toBeNull();

    usePathnameMock.mockReturnValue("/app");
    rerender(
      <Sidebar
        {...baseProps}
        user={{ name: "Lara", isAdmin: false }}
        platformAccess={ownerAccess}
      />,
    );
    expect(screen.getByRole("link", { name: /Platform overview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Agencies$/i })).toBeInTheDocument();
  });

  it("highlights only provider setup on its overlapping route", () => {
    usePathnameMock.mockReturnValue("/app/agency-settings/social/providers");
    render(<Sidebar {...baseProps} user={{ name: "Lara", isAdmin: true }} />);
    expect(screen.getByRole("link", { name: /Social provider setup/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /Social analytics/i })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it.each([
    ["Owner", ownerAccess, true, true, true],
    [
      "Agency Operator",
      { ...ownerAccess, canReadSecurity: false, canReadAccess: false },
      true,
      false,
      false,
    ],
    ["Auditor", { ...ownerAccess, canReadSecurity: true, canReadAccess: true }, true, true, true],
    ["Support", { ...ownerAccess, canReadSecurity: true, canReadAccess: false }, true, true, false],
  ])(
    "renders the %s platform navigation matrix",
    (_label, access, agencies, security, accessPage) => {
      usePathnameMock.mockReturnValue("/app/platform/overview");
      render(<Sidebar {...baseProps} platformAccess={access as typeof ownerAccess} />);
      expect(!!screen.queryByRole("link", { name: /^Agencies$/i })).toBe(agencies);
      expect(!!screen.queryByRole("link", { name: /Security & support/i })).toBe(security);
      expect(!!screen.queryByRole("link", { name: /Platform access/i })).toBe(accessPage);
    },
  );

  it("renders the workspace nav when the user is inside /app/w/[slug]/*", async () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/planning");
    const user = userEvent.setup();
    render(<Sidebar {...baseProps} canAccessTrendRadar />);
    // Workspace tabs are rendered, pointing to the current workspace
    const overview = screen.getByRole("link", { name: "Overview" });
    expect(overview).toHaveAttribute("href", "/app/w/northstar");
    const planning = screen.getByRole("link", { name: "Planning" });
    expect(planning).toHaveAttribute("href", "/app/w/northstar/planning");
    expect(screen.getByRole("link", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trend Radar" })).toHaveAttribute(
      "href",
      "/app/w/northstar/trends",
    );
    expect(screen.getByRole("link", { name: "Approvals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Channels" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Brand kit" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Team" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Settings" }));
    expect(screen.getByRole("link", { name: "Trend settings" })).toHaveAttribute(
      "href",
      "/app/w/northstar/settings/trends",
    );
    // "Workspaces" list link is NOT rendered in workspace mode
    expect(screen.queryByRole("link", { name: "Workspaces" })).toBeNull();
    // "Create content" CTA IS rendered in workspace mode
    const cta = screen.getByTestId("sidebar-create-content");
    expect(cta).toHaveAttribute("href", "/app/w/northstar/planning/new");
  });

  it("keeps product branding compact and leaves workspace identity to the switcher", () => {
    usePathnameMock.mockReturnValue("/app/w/autumn");
    render(<Sidebar {...baseProps} />);
    // Brand block: the parent <div class="min-w-0"> holds both the
    // product name and the workspace name.
    const productName = screen.getByText("StudioFlow");
    const brandRow = productName.parentElement as HTMLElement | null;
    expect(brandRow).not.toBeNull();
    expect(brandRow!.textContent).toBe("StudioFlow");
    expect(screen.getByTestId("sidebar-workspace-switcher-trigger")).toHaveAttribute(
      "aria-label",
      "Active workspace: Autumn Blend. Click to switch.",
    );
  });

  it("shows client reviewers only the client review navigation", () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/client");
    render(<Sidebar {...baseProps} workspaceAccess={{ "ws-1": "client", "ws-2": "internal" }} />);
    expect(screen.getByRole("link", { name: "Client review" })).toHaveAttribute(
      "href",
      "/app/w/northstar/client",
    );
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      "/app/w/northstar/client/calendar",
    );
    expect(screen.queryByRole("link", { name: "Planning" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Brand Kit" })).toBeNull();
    expect(screen.queryByTestId("sidebar-create-content")).toBeNull();
  });

  it("shows client reviewers only the client review navigation", () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/client");
    render(<Sidebar {...baseProps} workspaceAccess={{ "ws-1": "client", "ws-2": "internal" }} />);
    expect(screen.getByRole("link", { name: "Client review" })).toHaveAttribute(
      "href",
      "/app/w/northstar/client",
    );
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      "/app/w/northstar/client/calendar",
    );
    expect(screen.queryByRole("link", { name: "Planning" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Brand Kit" })).toBeNull();
    expect(screen.queryByTestId("sidebar-create-content")).toBeNull();
  });

  it("does not show the workspace name in the brand block in global mode", () => {
    usePathnameMock.mockReturnValue("/app");
    render(<Sidebar {...baseProps} />);
    // Brand block: the parent <div class="min-w-0"> only holds the
    // product name. The workspace switcher in the sidebar bottom DOES
    // still render the active workspace name even in global mode (per
    // the Stitch design), so the assertion targets the brand row only.
    const productName = screen.getByText("StudioFlow");
    const brandRow = productName.parentElement as HTMLElement | null;
    expect(brandRow).not.toBeNull();
    expect(brandRow!.textContent).not.toContain("Northstar Coffee");
  });

  it("highlights the active workspace tab based on the pathname", () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/calendar");
    render(<Sidebar {...baseProps} />);
    const calendar = screen.getByRole("link", { name: "Calendar" });
    expect(calendar).toHaveAttribute("aria-current", "page");
    // Calendar is nested under the active Planning route family, so
    // both the family parent and exact child communicate context.
    const planning = screen.getByRole("link", { name: "Planning" });
    expect(planning).toHaveAttribute("aria-current", "page");
  });

  it("does not mark the planning list as active on monthly or batch routes", () => {
    for (const pathname of [
      "/app/w/northstar/planning/monthly",
      "/app/w/northstar/planning/batch",
    ]) {
      usePathnameMock.mockReturnValue(pathname);
      const { unmount } = render(<Sidebar {...baseProps} />);
      const monthly = screen.getByRole("link", { name: "Monthly planning" });
      if (pathname.endsWith("/monthly")) {
        expect(monthly).toHaveAttribute("aria-current", "page");
      } else {
        expect(monthly).not.toHaveAttribute("aria-current", "page");
      }
      expect(screen.getByRole("link", { name: "List" })).not.toHaveAttribute(
        "aria-current",
        "page",
      );
      unmount();
    }
  });

  it("does not mark agency settings General as active on child settings routes", () => {
    usePathnameMock.mockReturnValue("/app/agency-settings/planning-packs");
    render(<Sidebar {...baseProps} user={{ name: "Lara", isAdmin: true }} />);
    expect(screen.getByRole("link", { name: "Planning packs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "General" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("ignores an unknown workspace slug in the URL (no crash, falls back to global)", () => {
    usePathnameMock.mockReturnValue("/app/w/not-a-real-slug");
    render(<Sidebar {...baseProps} />);
    // Falls back to global mode (no workspace name shown, no workspace
    // tabs). The user is still authenticated; the route's own gate
    // is responsible for the 404.
    expect(screen.getByRole("link", { name: "My work" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Overview" })).toBeNull();
  });

  it("exposes board, design queue, and library in workspace navigation", () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/board");
    render(<Sidebar {...baseProps} />);
    expect(screen.getByRole("link", { name: /Board/i })).toHaveAttribute(
      "href",
      "/app/w/northstar/board",
    );
    expect(screen.getByRole("link", { name: "Design queue" })).toHaveAttribute(
      "href",
      "/app/w/northstar/design-queue",
    );
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute(
      "href",
      "/app/w/northstar/library",
    );
  });

  it("hides Create content when the actor lacks creation capability", () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/planning");
    render(<Sidebar {...baseProps} workspaceCanCreateContent={{ "ws-1": false }} />);
    expect(screen.queryByTestId("sidebar-create-content")).toBeNull();
  });
});

describe("Sidebar (agency switcher wiring — M1.5)", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
    usePathnameMock.mockReturnValue("/app");
    pushMock.mockReset();
    refreshMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ redirectTo: "/app" }),
    });
  });

  it("renders the agency switcher trigger with the active agency name", () => {
    render(
      <Sidebar
        {...baseProps}
        agencySwitcher={{
          ...baseProps.agencySwitcher,
          options: [
            ...baseProps.agencySwitcher.options,
            { id: "agency-2", name: "Second Agency", slug: "second", isAdmin: false },
          ],
        }}
      />,
    );
    const trigger = screen.getByTestId("sidebar-agency-switcher-trigger");
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-label", "Active agency: Test Agency. Click to switch.");
  });

  it("places the agency switcher above the workspace switcher in the DOM order", () => {
    render(
      <Sidebar
        {...baseProps}
        agencySwitcher={{
          ...baseProps.agencySwitcher,
          options: [
            ...baseProps.agencySwitcher.options,
            { id: "agency-2", name: "Second Agency", slug: "second", isAdmin: false },
          ],
        }}
      />,
    );
    const agency = screen.getByTestId("sidebar-agency-switcher-trigger");
    const workspace = screen.getByTestId("sidebar-workspace-switcher-trigger");
    // document order: agency appears before workspace
    expect(
      agency.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders a disabled 'No agency' trigger when the user has zero memberships", () => {
    render(
      <Sidebar
        {...baseProps}
        agencySwitcher={{ active: null, options: [] }}
        platformAccess={ownerAccess}
      />,
    );
    const trigger = screen.getByRole("button", { name: "No agencies" });
    expect(trigger).toBeDisabled();
  });

  it("keeps the active agency context visible even when only one agency is available", () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByTestId("sidebar-agency-switcher-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-workspace-switcher-trigger")).toBeInTheDocument();
  });

  it("lands on the new agency's first workspace after switching agencies (no-workspace fallback to /app)", async () => {
    const user = userEvent.setup();
    render(
      <Sidebar
        {...baseProps}
        agencySwitcher={{
          active: baseProps.agencySwitcher.active,
          options: [
            baseProps.agencySwitcher.active,
            { id: "agency-2", name: "Second Agency", slug: "second", isAdmin: false },
          ],
        }}
      />,
    );

    await user.click(screen.getByTestId("sidebar-agency-switcher-trigger"));
    await user.click(screen.getByRole("option", { name: /Second Agency/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/agency/switch",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ agencyId: "agency-2" }),
        }),
      );
      expect(pushMock).toHaveBeenCalledWith("/app");
    });
  });

  it("navigates to the new agency's first workspace slug when one is returned", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ redirectTo: "/app/w/second-ws" }),
    });
    render(
      <Sidebar
        {...baseProps}
        agencySwitcher={{
          active: baseProps.agencySwitcher.active,
          options: [
            baseProps.agencySwitcher.active,
            { id: "agency-2", name: "Second Agency", slug: "second", isAdmin: false },
          ],
        }}
      />,
    );

    await user.click(screen.getByTestId("sidebar-agency-switcher-trigger"));
    await user.click(screen.getByRole("option", { name: /Second Agency/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/agency/switch",
        expect.objectContaining({ body: JSON.stringify({ agencyId: "agency-2" }) }),
      );
      // The response destination is navigated after the cookie has been
      // committed by the POST endpoint.
      expect(pushMock).toHaveBeenCalledWith("/app/w/second-ws");
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("keeps the user on the current page when the switch is refused", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "not-a-member" }),
    });
    render(
      <Sidebar
        {...baseProps}
        agencySwitcher={{
          active: baseProps.agencySwitcher.active,
          options: [
            baseProps.agencySwitcher.active,
            { id: "agency-2", name: "Second Agency", slug: "second", isAdmin: false },
          ],
        }}
      />,
    );

    await user.click(screen.getByTestId("sidebar-agency-switcher-trigger"));
    await user.click(screen.getByRole("option", { name: /Second Agency/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/agency/switch",
        expect.objectContaining({ body: JSON.stringify({ agencyId: "agency-2" }) }),
      );
    });
    // The router MUST NOT push anywhere when the switch is refused
    // (membership check failed or session expired). A forced
    // navigation would mask the failure.
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("Sidebar (/ui-ux-pro-max refinement)", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
  });

  it("surfaces actionable badge counts in the workspace sidebar", () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/planning");
    render(
      <Sidebar
        {...baseProps}
        workspaceBadgesByWorkspaceId={{
          "ws-1": { approvals: 3, designQueue: 2 },
          "ws-2": { approvals: 0, designQueue: 0 },
        }}
      />,
    );
    const approvalsBadge = screen.getByTestId("sidebar-badge-approvals");
    expect(approvalsBadge).toHaveTextContent("3");
    const designQueueBadge = screen.getByTestId("sidebar-badge-design-queue");
    expect(designQueueBadge).toHaveTextContent("2");
  });

  it("hides badges when the count is zero", () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/planning");
    render(
      <Sidebar
        {...baseProps}
        workspaceBadgesByWorkspaceId={{
          "ws-1": { approvals: 0, designQueue: 0 },
          "ws-2": { approvals: 0, designQueue: 0 },
        }}
      />,
    );
    expect(screen.queryByTestId("sidebar-badge-approvals")).toBeNull();
    expect(screen.queryByTestId("sidebar-badge-design-queue")).toBeNull();
  });

  it("collapses to icon-rail when collapsed=true while preserving context switchers", () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/planning");
    render(<Sidebar {...baseProps} collapsed={true} />);
    // Brand block: the logo (icon) is still discoverable via the link's
    // accessible name; the text label is hidden in icon-rail mode.
    expect(screen.getByLabelText("StudioFlow home")).toBeInTheDocument();
    // Context switching remains available in the icon rail; labels are
    // visually hidden but both controls keep their accessible names.
    expect(screen.getByTestId("sidebar-context-switchers")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-workspace-switcher-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-agency-switcher-trigger")).toBeInTheDocument();
    // Create content CTA still rendered (per spec §18)
    expect(screen.getByTestId("sidebar-create-content")).toBeInTheDocument();
    // Footer collapse toggle is visible so the user can expand again
    expect(screen.getByTestId("sidebar-collapse-toggle")).toBeInTheDocument();
  });

  it("groups workspace navigation by Content / Performance / Brand / Manage", () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/team");
    render(<Sidebar {...baseProps} />);
    // Group headings render
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("Brand")).toBeInTheDocument();
    expect(screen.getByText("Manage")).toBeInTheDocument();
  });

  it("hides the Manage group when the user is a viewer (not a manager)", () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/planning");
    render(
      <Sidebar
        {...baseProps}
        user={{ name: "Viewer", isAdmin: false }}
        workspaceCanCreateContent={{ "ws-1": false, "ws-2": false }}
      />,
    );
    expect(screen.queryByText("Manage")).toBeNull();
  });

  it("renders the workspace switcher at the top of the sidebar in workspace mode", () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/planning");
    render(<Sidebar {...baseProps} />);
    // The switcher is rendered; the desktop layout mounts it inside
    // a parent <aside data-testid="app-sidebar">. Standalone, the
    // switcher is simply in the document at the top of the Sidebar.
    const switcher = screen.getByTestId("sidebar-workspace-switcher-trigger");
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toContainElement(switcher);
  });

  it("renames Reviews → Approvals and Social Channels → Channels per spec §5/§6", () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/planning");
    render(<Sidebar {...baseProps} />);
    expect(screen.getByRole("link", { name: "Approvals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Channels" })).toBeInTheDocument();
    // Old labels should no longer appear
    expect(screen.queryByRole("link", { name: "Reviews" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Social Channels" })).toBeNull();
  });
});

/**
 * Workspace switcher — detail-suffix behaviour (M1.5 + fix).
 *
 * The pre-fix switcher hard-coded `/planning/<id>` as the only
 * "detail section" and used `pathname.replace(...)` for every
 * other suffix. The result: a new detail route under any other
 * section (e.g. `/app/w/old/reviews/<id>`) would silently carry
 * the stale id into the new workspace, producing a confusing
 * cross-tenant 404.
 *
 * The post-fix switcher treats the first segment after the
 * section as either (a) a known workspace-scoped sub-action
 * (`new` / `batch` / `edit`) or (b) a detail id. (a) is kept,
 * (b) is stripped to the section index. This makes the rule
 * section-agnostic — adding a new detail route under any
 * section works without touching the switcher.
 *
 * The cases below pin the contract: detail routes are stripped,
 * sub-action routes are kept, and the section index is
 * preserved.
 */
describe("Sidebar (workspace switcher — detail-suffix behaviour)", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
    pushMock.mockReset();
  });

  async function chooseOtherWorkspace() {
    const trigger = screen.getByTestId("sidebar-workspace-switcher-trigger");
    const user = userEvent.setup();
    await user.click(trigger);
    const autumn = await screen.findByRole("option", { name: /Autumn Blend/ });
    await user.click(autumn);
  }

  it("strips a detail id from /app/w/<old>/planning/<id> to the section index in the new workspace", async () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/planning/abc-123-uuid");
    render(<Sidebar {...baseProps} />);
    await chooseOtherWorkspace();
    expect(pushMock).toHaveBeenCalledWith("/app/w/autumn/planning");
  });

  it("strips a nested detail sub-path /app/w/<old>/planning/<id>/edit to the section index", async () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/planning/abc-123-uuid/edit");
    render(<Sidebar {...baseProps} />);
    await chooseOtherWorkspace();
    expect(pushMock).toHaveBeenCalledWith("/app/w/autumn/planning");
  });

  it("keeps a known sub-action /app/w/<old>/planning/batch across the slug swap", async () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/planning/batch");
    render(<Sidebar {...baseProps} />);
    await chooseOtherWorkspace();
    expect(pushMock).toHaveBeenCalledWith("/app/w/autumn/planning/batch");
  });

  it("keeps /app/w/<old>/planning/new across the slug swap", async () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/planning/new");
    render(<Sidebar {...baseProps} />);
    await chooseOtherWorkspace();
    expect(pushMock).toHaveBeenCalledWith("/app/w/autumn/planning/new");
  });

  it("strips the id from the edit detail route /app/w/<old>/planning/edit/<id> → /app/w/<new>/planning", async () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/planning/edit/abc-123-uuid");
    render(<Sidebar {...baseProps} />);
    await chooseOtherWorkspace();
    expect(pushMock).toHaveBeenCalledWith("/app/w/autumn/planning");
  });

  it("strips a detail id from a NEW section (reviews) — section-agnostic generalisation", async () => {
    // The pre-fix switcher only knew about `planning` as a detail
    // section. A future route under a different section would
    // leak a stale id. The new switcher treats any non-sub-action
    // segment as a detail id and strips it.
    usePathnameMock.mockReturnValue("/app/w/northstar/reviews/abc-123-uuid");
    render(<Sidebar {...baseProps} />);
    await chooseOtherWorkspace();
    expect(pushMock).toHaveBeenCalledWith("/app/w/autumn/reviews");
  });

  it("keeps a same-section path that has no detail id (/app/w/<old>/planning)", async () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/planning");
    render(<Sidebar {...baseProps} />);
    await chooseOtherWorkspace();
    expect(pushMock).toHaveBeenCalledWith("/app/w/autumn/planning");
  });
});
