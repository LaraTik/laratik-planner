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

// The agency switcher calls a `"use server"` action (next-auth → auth/config).
// Vitest's CJS/ESM resolution chokes on next-auth's `import "next/server"`
// (no `.js` extension). We mock the action surface so the import graph
// stops at the agency-switcher module boundary.
const switchActiveAgencyMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/auth/agency-actions", () => ({
  switchActiveAgency: switchActiveAgencyMock,
}));

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
  agencySwitcher: {
    active: { id: "agency-1", name: "Test Agency", slug: "test-agency", isAdmin: true },
    options: [{ id: "agency-1", name: "Test Agency", slug: "test-agency", isAdmin: true }],
  },
  canCreateWorkspace: false,
};

describe("Sidebar (workspace-aware)", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
  });

  it("renders the global nav when the user is on a global page", () => {
    usePathnameMock.mockReturnValue("/app");
    render(<Sidebar {...baseProps} />);
    expect(screen.getByRole("link", { name: "My Work" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Workspaces" })).toBeInTheDocument();
    // Workspace tabs are NOT rendered in global mode
    expect(screen.queryByRole("link", { name: "Overview" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Planning" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Calendar" })).toBeNull();
    // "Create content" CTA is NOT shown in global mode
    expect(screen.queryByTestId("sidebar-create-content")).toBeNull();
  });

  it("hides admin items in the sidebar when the user is not an admin (global mode)", () => {
    usePathnameMock.mockReturnValue("/app");
    render(<Sidebar {...baseProps} user={{ name: "Lara", isAdmin: false }} />);
    expect(screen.queryByRole("link", { name: /User Management/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Agency Settings/i })).toBeNull();
  });

  it("shows admin items in the sidebar when the user is an admin (global mode)", () => {
    usePathnameMock.mockReturnValue("/app");
    render(<Sidebar {...baseProps} user={{ name: "Lara", isAdmin: true }} />);
    expect(screen.getByRole("link", { name: /User Management/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Agency Settings/i })).toBeInTheDocument();
  });

  it("shows plan usage to agency admins and platform console only to platform admins", () => {
    usePathnameMock.mockReturnValue("/app/agency-settings/plan");
    const { rerender } = render(
      <Sidebar {...baseProps} user={{ name: "Lara", isAdmin: true }} isPlatformAdmin={false} />,
    );
    expect(screen.getByRole("link", { name: /Plan and usage/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Platform overview/i })).toBeNull();

    usePathnameMock.mockReturnValue("/app");
    rerender(
      <Sidebar {...baseProps} user={{ name: "Lara", isAdmin: false }} isPlatformAdmin />,
    );
    expect(screen.getByRole("link", { name: /Platform overview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Agencies$/i })).toBeInTheDocument();
  });

  it("renders the workspace nav when the user is inside /app/w/[slug]/*", () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/planning");
    render(<Sidebar {...baseProps} />);
    // Workspace tabs are rendered, pointing to the current workspace
    const overview = screen.getByRole("link", { name: "Overview" });
    expect(overview).toHaveAttribute("href", "/app/w/northstar");
    const planning = screen.getByRole("link", { name: "Planning" });
    expect(planning).toHaveAttribute("href", "/app/w/northstar/planning");
    expect(screen.getByRole("link", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reviews" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Social Channels" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Brand Kit" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Team" })).toBeInTheDocument();
    // "Workspaces" list link is NOT rendered in workspace mode
    expect(screen.queryByRole("link", { name: "Workspaces" })).toBeNull();
    // "Create content" CTA IS rendered in workspace mode
    const cta = screen.getByTestId("sidebar-create-content");
    expect(cta).toHaveAttribute("href", "/app/w/northstar/planning/new");
  });

  it("renders the workspace name in the brand block when in workspace mode", () => {
    usePathnameMock.mockReturnValue("/app/w/autumn");
    render(<Sidebar {...baseProps} />);
    // Brand block: the parent <div class="min-w-0"> holds both the
    // product name and the workspace name.
    const productName = screen.getByText("StudioFlow");
    const brandRow = productName.parentElement as HTMLElement | null;
    expect(brandRow).not.toBeNull();
    expect(brandRow!.textContent).toContain("Autumn Blend");
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
    // An inactive sibling is not marked current
    const planning = screen.getByRole("link", { name: "Planning" });
    expect(planning).not.toHaveAttribute("aria-current", "page");
  });

  it("ignores an unknown workspace slug in the URL (no crash, falls back to global)", () => {
    usePathnameMock.mockReturnValue("/app/w/not-a-real-slug");
    render(<Sidebar {...baseProps} />);
    // Falls back to global mode (no workspace name shown, no workspace
    // tabs). The user is still authenticated; the route's own gate
    // is responsible for the 404.
    expect(screen.getByRole("link", { name: "My Work" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Overview" })).toBeNull();
  });
});

describe("Sidebar (agency switcher wiring — M1.5)", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
    usePathnameMock.mockReturnValue("/app");
    pushMock.mockReset();
    refreshMock.mockReset();
    switchActiveAgencyMock.mockReset();
    switchActiveAgencyMock.mockResolvedValue(true);
  });

  it("renders the agency switcher trigger with the active agency name", () => {
    render(<Sidebar {...baseProps} />);
    const trigger = screen.getByTestId("sidebar-agency-switcher-trigger");
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-label", "Active agency: Test Agency. Click to switch.");
  });

  it("places the agency switcher above the workspace switcher in the DOM order", () => {
    render(<Sidebar {...baseProps} />);
    const agency = screen.getByTestId("sidebar-agency-switcher-trigger");
    const workspace = screen.getByTestId("sidebar-workspace-switcher-trigger");
    // document order: agency appears before workspace
    expect(
      agency.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders a disabled 'No agency' trigger when the user has zero memberships", () => {
    render(<Sidebar {...baseProps} agencySwitcher={{ active: null, options: [] }} />);
    const trigger = screen.getByRole("button", { name: "No agencies" });
    expect(trigger).toBeDisabled();
  });

  it("lands on the neutral app page after switching agencies", async () => {
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
      expect(switchActiveAgencyMock).toHaveBeenCalledWith("agency-2");
      expect(pushMock).toHaveBeenCalledWith("/app");
      expect(refreshMock).toHaveBeenCalled();
    });
  });
});
