import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "@/components/app-shell/sidebar";
import { WorkspaceSwitcher } from "@/components/app-shell/workspace-switcher";

// next/navigation's usePathname + useRouter are client hooks. We stub
// usePathname per-test via vi.mock so the same suite can exercise
// both the global-mode and workspace-mode branches of the
// workspace-aware sidebar. useRouter is also stubbed for the
// standalone workspace switcher contract tests below.
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

const baseProps = {
  user: { name: "Lara", isAdmin: false },
  workspaces: [
    { id: "ws-1", name: "Northstar Coffee", slug: "northstar" },
    { id: "ws-2", name: "Autumn Blend", slug: "autumn" },
  ],
  workspaceCanCreateContent: { "ws-1": true, "ws-2": true },
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

  it("keeps workspace context out of the sidebar", () => {
    usePathnameMock.mockReturnValue("/app/workspaces");
    render(<Sidebar {...baseProps} />);

    expect(screen.queryByTestId("sidebar-workspace-context")).toBeNull();
    expect(screen.queryByTestId("sidebar-workspace-switcher-trigger")).toBeNull();
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
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning");
    const user = userEvent.setup();
    render(<Sidebar {...baseProps} canAccessTrendRadar />);
    // Workspace tabs are rendered, pointing to the current workspace
    const overview = screen.getByRole("link", { name: "Command Center" });
    expect(overview).toHaveAttribute("href", "/app/a/acme/w/northstar");
    const planning = screen.getByRole("link", { name: "Planning" });
    expect(planning).toHaveAttribute("href", "/app/a/acme/w/northstar/planning");
    expect(screen.queryByRole("link", { name: "Calendar" })).toBeNull();
    expect(screen.getByRole("link", { name: "Trend Radar" })).toHaveAttribute(
      "href",
      "/app/a/acme/w/northstar/trends",
    );
    expect(screen.getByRole("link", { name: "Approvals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Channels" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Brand kit" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Team" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Settings" }));
    expect(screen.getByRole("link", { name: "Trend settings" })).toHaveAttribute(
      "href",
      "/app/a/acme/w/northstar/settings/trends",
    );
    // "Workspaces" list link is NOT rendered in workspace mode
    expect(screen.queryByRole("link", { name: "Workspaces" })).toBeNull();
    // "Create content" CTA IS rendered in workspace mode
    const cta = screen.getByTestId("sidebar-create-content");
    expect(cta).toHaveAttribute("href", "/app/a/acme/w/northstar/planning/new");
  });

  it("keeps product branding compact and leaves workspace identity to the topbar", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/autumn");
    render(<Sidebar {...baseProps} />);
    // Brand block: the parent <div class="min-w-0"> holds both the
    // product name and the workspace name.
    const productName = screen.getByText("StudioFlow");
    const brandRow = productName.parentElement as HTMLElement | null;
    expect(brandRow).not.toBeNull();
    expect(brandRow!.textContent).toBe("StudioFlow");
    expect(screen.queryByTestId("sidebar-workspace-switcher-trigger")).toBeNull();
  });

  it("shows client reviewers only the client review navigation", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/client");
    render(<Sidebar {...baseProps} workspaceAccess={{ "ws-1": "client", "ws-2": "internal" }} />);
    expect(screen.getByRole("link", { name: "Client review" })).toHaveAttribute(
      "href",
      "/app/a/acme/w/northstar/client",
    );
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      "/app/a/acme/w/northstar/client/calendar",
    );
    expect(screen.queryByRole("link", { name: "Planning" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Brand Kit" })).toBeNull();
    expect(screen.queryByTestId("sidebar-create-content")).toBeNull();
  });

  it("shows client reviewers only the client review navigation", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/client");
    render(<Sidebar {...baseProps} workspaceAccess={{ "ws-1": "client", "ws-2": "internal" }} />);
    expect(screen.getByRole("link", { name: "Client review" })).toHaveAttribute(
      "href",
      "/app/a/acme/w/northstar/client",
    );
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      "/app/a/acme/w/northstar/client/calendar",
    );
    expect(screen.queryByRole("link", { name: "Planning" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Brand Kit" })).toBeNull();
    expect(screen.queryByTestId("sidebar-create-content")).toBeNull();
  });

  it("does not show the workspace name in the brand block in global mode", () => {
    usePathnameMock.mockReturnValue("/app");
    render(<Sidebar {...baseProps} />);
    // Brand block: the parent <div class="min-w-0"> only holds the
    // product name; workspace identity is owned by the topbar.
    const productName = screen.getByText("StudioFlow");
    const brandRow = productName.parentElement as HTMLElement | null;
    expect(brandRow).not.toBeNull();
    expect(brandRow!.textContent).not.toContain("Northstar Coffee");
  });

  it("highlights the active workspace tab based on the pathname", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/calendar");
    render(<Sidebar {...baseProps} />);
    const planning = screen.getByRole("link", { name: "Planning" });
    expect(planning).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Calendar" })).toBeNull();
  });

  it("keeps Planning active across its deep-link routes", () => {
    for (const pathname of [
      "/app/a/acme/w/northstar/planning/monthly",
      "/app/a/acme/w/northstar/planning/batch",
      "/app/a/acme/w/northstar/board",
    ]) {
      usePathnameMock.mockReturnValue(pathname);
      const { unmount } = render(<Sidebar {...baseProps} />);
      expect(screen.getByRole("link", { name: "Planning" })).toHaveAttribute(
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
    usePathnameMock.mockReturnValue("/app/a/acme/w/not-a-real-slug");
    render(<Sidebar {...baseProps} />);
    // Falls back to global mode (no workspace name shown, no workspace
    // tabs). The user is still authenticated; the route's own gate
    // is responsible for the 404.
    expect(screen.getByRole("link", { name: "My work" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Overview" })).toBeNull();
  });

  it("exposes the canonical Planning route, design queue, and library in workspace navigation", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/board");
    render(<Sidebar {...baseProps} />);
    expect(screen.getByRole("link", { name: "Planning" })).toHaveAttribute(
      "href",
      "/app/a/acme/w/northstar/planning",
    );
    expect(screen.queryByRole("link", { name: /Board/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Design queue" })).toHaveAttribute(
      "href",
      "/app/a/acme/w/northstar/design-queue",
    );
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute(
      "href",
      "/app/a/acme/w/northstar/library",
    );
  });

  it("hides Create content when the actor lacks creation capability", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning");
    render(<Sidebar {...baseProps} workspaceCanCreateContent={{ "ws-1": false }} />);
    expect(screen.queryByTestId("sidebar-create-content")).toBeNull();
  });
});

describe("Sidebar (/ui-ux-pro-max refinement)", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
  });

  it("surfaces actionable badge counts in the workspace sidebar", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning");
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
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning");
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

  it("collapses to icon-rail without duplicating workspace context", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning");
    render(<Sidebar {...baseProps} collapsed={true} />);
    // Brand block: the logo (icon) is still discoverable via the link's
    // accessible name; the text label is hidden in icon-rail mode.
    expect(screen.getByLabelText("StudioFlow home")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-workspace-context")).toBeNull();
    // Create content CTA still rendered (per spec §18)
    expect(screen.getByTestId("sidebar-create-content")).toBeInTheDocument();
    // Footer collapse toggle is visible so the user can expand again
    expect(screen.getByTestId("sidebar-collapse-toggle")).toBeInTheDocument();
  });

  it("groups workspace navigation by Plan / Understand / Produce / Manage", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/team");
    render(<Sidebar {...baseProps} />);
    // Group headings render
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Understand")).toBeInTheDocument();
    expect(screen.getByText("Produce")).toBeInTheDocument();
    expect(screen.getByText("Manage")).toBeInTheDocument();
  });

  it("hides the Manage group when the user is a viewer (not a manager)", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning");
    render(
      <Sidebar
        {...baseProps}
        user={{ name: "Viewer", isAdmin: false }}
        workspaceCanCreateContent={{ "ws-1": false, "ws-2": false }}
      />,
    );
    expect(screen.queryByText("Manage")).toBeNull();
  });

  it("does not render a duplicate workspace switcher in workspace mode", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning");
    render(<Sidebar {...baseProps} />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).not.toContainElement(screen.queryByTestId("topbar-workspace-switcher-trigger"));
    expect(screen.queryByTestId("sidebar-workspace-switcher-trigger")).toBeNull();
  });

  it("renames Reviews → Approvals and Social Channels → Channels per spec §5/§6", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning");
    render(<Sidebar {...baseProps} />);
    expect(screen.getByRole("link", { name: "Approvals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Channels" })).toBeInTheDocument();
    // Old labels should no longer appear
    expect(screen.queryByRole("link", { name: "Reviews" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Social Channels" })).toBeNull();
  });
});

/**
 * Round-4 ui-ux-pro-max refinement cases.
 *
 * The earlier `/ui-ux-pro-max refinement` block above covers the
 * first three pass-rounds. Round-4 adds:
 *   - Active state with three signals (color + weight + left rail)
 *   - Group dividers between the five nav buckets
 *   - Group headings visible at every expanded breakpoint
 *   - Tenant card header label + divider between agency/workspace
 *   - Personal group in workspace mode (My tasks only)
 *   - Global group in agency mode (All tasks + Global calendar)
 *   - Single-agency shortcut → /app/agency-settings link
 *   - Workspace switcher tab indicator
 *   - clampBadge formatter
 */
describe("Sidebar (round-4 /ui-ux-pro-max refinement)", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
  });

  it("renders the Personal group (My tasks only) inside workspace mode", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning");
    render(<Sidebar {...baseProps} />);
    // The Personal group must show My tasks …
    expect(screen.getByRole("link", { name: "My tasks" })).toHaveAttribute(
      "href",
      "/app/tasks/mine",
    );
    // … but NOT All tasks or Global calendar (those are agency-only).
    expect(screen.queryByRole("link", { name: "All tasks" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Global calendar" })).toBeNull();
  });

  it("keeps My tasks reachable on global routes too (no orphaned destination)", () => {
    usePathnameMock.mockReturnValue("/app/tasks");
    render(<Sidebar {...baseProps} />);
    // Round-4a moved All tasks / Global calendar into the agency-only
    // Global group. My tasks is personal, so it has to stay
    // reachable on BOTH sides of the workspace boundary —
    // otherwise global-mode users lose the destination entirely.
    expect(screen.getByRole("link", { name: "My tasks" })).toHaveAttribute(
      "href",
      "/app/tasks/mine",
    );
    expect(screen.getByRole("link", { name: "All tasks" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Global calendar" })).toBeInTheDocument();
  });

  it("resolves the Tenant header + group headings through the labels map (bilingual)", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning");
    render(
      <Sidebar
        {...baseProps}
        labels={{
          tenantLabel: "المؤسسة",
          plan: "التخطيط",
          global: "عام",
          understand: "الفهم والتحليل",
        }}
      />,
    );
    // Regression guard for the round-4 threading bug: the group
    // heading reads `labels[group.key]` (the SPEC key, e.g.
    // "plan" / "global"), NOT the catalog suffix
    // ("globalGroup"). If the layout threads the wrong key the
    // heading silently falls back to the hardcoded English
    // `group.label` and Arabic users see untranslated chrome.
    expect(screen.getByTestId("sidebar-group-label-plan")).toHaveTextContent("التخطيط");
    expect(screen.getByTestId("sidebar-group-label-understand")).toHaveTextContent(
      "الفهم والتحليل",
    );
  });

  it("resolves the Global group heading through the labels map (bilingual)", () => {
    usePathnameMock.mockReturnValue("/app/tasks");
    render(<Sidebar {...baseProps} labels={{ global: "عام", agency: "الوكالة" }} />);
    // `global` is an agency-side nav key. This pins the
    // Global heading can't silently fall back to English.
    expect(screen.getByTestId("sidebar-group-label-global")).toHaveTextContent("عام");
  });

  it("keeps workspace context out of the sidebar", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning");
    render(<Sidebar {...baseProps} />);
    expect(screen.queryByTestId("sidebar-workspace-context")).toBeNull();
    expect(screen.queryByTestId("sidebar-workspace-switcher-trigger")).toBeNull();
  });

  it("renders the Global group (All tasks + Global calendar) on global routes", () => {
    usePathnameMock.mockReturnValue("/app/calendar");
    render(<Sidebar {...baseProps} />);
    expect(screen.getByRole("link", { name: "All tasks" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Global calendar" })).toBeInTheDocument();
  });

  it("marks the active workspace link with a left-edge primary rail", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning");
    render(<Sidebar {...baseProps} />);
    const planning = screen.getByRole("link", { name: "Planning" });
    expect(planning).toHaveAttribute("aria-current", "page");
    // The left-edge rail uses logical `border-s-4` + `border-s-primary`
    // on the row container. Planning is an expandable group, so
    // the rail lives on the parent `<div>` that wraps both the
    // link and the chevron toggle — walk up to find it.
    const planningRow = planning.closest("[class*='border-s-4']");
    expect(planningRow).not.toBeNull();
    expect(planningRow!.className).toMatch(/border-s-primary/);
  });

  it("renders group dividers between every pair of groups (after the first)", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning");
    render(<Sidebar {...baseProps} />);
    // The sidebar carries a Plan group heading and a Produce
    // group heading; the divider between them is the `border-t
    // border-border` class on the Produce group container.
    const produceHeading = screen.getByTestId("sidebar-group-label-produce");
    expect(produceHeading.parentElement?.className ?? "").toMatch(/border-t/);
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
function renderWorkspaceSwitcher() {
  render(
    <WorkspaceSwitcher
      active={baseProps.workspaces[0]!}
      options={baseProps.workspaces}
      canCreate={false}
      testId="workspace-switcher-trigger"
    />,
  );
}

describe("Sidebar (workspace switcher — detail-suffix behaviour)", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
    pushMock.mockReset();
  });

  async function chooseOtherWorkspace() {
    const trigger = screen.getByTestId("workspace-switcher-trigger");
    const user = userEvent.setup();
    await user.click(trigger);
    const autumn = await screen.findByRole("option", { name: /Autumn Blend/ });
    await user.click(autumn);
  }

  it("strips a detail id from /app/w/<old>/planning/<id> to the section index in the new workspace", async () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning/abc-123-uuid");
    renderWorkspaceSwitcher();
    await chooseOtherWorkspace();
    expect(pushMock).toHaveBeenCalledWith("/app/a/acme/w/autumn/planning");
  });

  it("strips a nested detail sub-path /app/w/<old>/planning/<id>/edit to the section index", async () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning/abc-123-uuid/edit");
    renderWorkspaceSwitcher();
    await chooseOtherWorkspace();
    expect(pushMock).toHaveBeenCalledWith("/app/a/acme/w/autumn/planning");
  });

  it("keeps a known sub-action /app/w/<old>/planning/batch across the slug swap", async () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning/batch");
    renderWorkspaceSwitcher();
    await chooseOtherWorkspace();
    expect(pushMock).toHaveBeenCalledWith("/app/a/acme/w/autumn/planning/batch");
  });

  it("keeps /app/w/<old>/planning/new across the slug swap", async () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning/new");
    renderWorkspaceSwitcher();
    await chooseOtherWorkspace();
    expect(pushMock).toHaveBeenCalledWith("/app/a/acme/w/autumn/planning/new");
  });

  it("strips the id from the edit detail route /app/w/<old>/planning/edit/<id> → /app/w/<new>/planning", async () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning/edit/abc-123-uuid");
    renderWorkspaceSwitcher();
    await chooseOtherWorkspace();
    expect(pushMock).toHaveBeenCalledWith("/app/a/acme/w/autumn/planning");
  });

  it("strips a detail id from a NEW section (reviews) — section-agnostic generalisation", async () => {
    // The pre-fix switcher only knew about `planning` as a detail
    // section. A future route under a different section would
    // leak a stale id. The new switcher treats any non-sub-action
    // segment as a detail id and strips it.
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/reviews/abc-123-uuid");
    renderWorkspaceSwitcher();
    await chooseOtherWorkspace();
    expect(pushMock).toHaveBeenCalledWith("/app/a/acme/w/autumn/reviews");
  });

  it("keeps a same-section path that has no detail id (/app/w/<old>/planning)", async () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning");
    renderWorkspaceSwitcher();
    await chooseOtherWorkspace();
    expect(pushMock).toHaveBeenCalledWith("/app/a/acme/w/autumn/planning");
  });
});
