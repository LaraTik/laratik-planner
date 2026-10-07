import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileNav } from "@/components/app-shell/mobile-nav";

const usePathnameMock = vi.fn<() => string>(() => "/app");
const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

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

vi.mock("@/lib/auth/agency-actions", () => ({
  switchActiveAgencyAndRedirect: vi.fn(async (agencyId: string) => ({
    ok: true as const,
    agencyId,
    firstWorkspaceSlug: null,
  })),
}));

const baseProps = {
  user: { isAdmin: true },
  workspaces: [
    { id: "ws-1", name: "Northstar Coffee", slug: "northstar" },
    { id: "ws-2", name: "Autumn Blend", slug: "autumn" },
  ],
  workspaceAccess: { "ws-1": "internal", "ws-2": "client" } as const,
  workspaceCanCreateContent: { "ws-1": true, "ws-2": false },
  agencySwitcher: {
    active: { id: "agency-1", name: "Creative Agency", slug: "creative", isAdmin: true },
    options: [{ id: "agency-1", name: "Creative Agency", slug: "creative", isAdmin: true }],
  },
  canCreateWorkspace: true,
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

describe("MobileNav", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
    pushMock.mockReset();
    refreshMock.mockReset();
  });

  it("uses workspace creation as the global primary action", () => {
    usePathnameMock.mockReturnValue("/app/workspaces");
    render(<MobileNav {...baseProps} />);
    expect(screen.getByRole("link", { name: "My Work" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Workspaces" })).toHaveAttribute(
      "href",
      "/app/workspaces",
    );
    expect(screen.getByRole("link", { name: "People" })).toHaveAttribute("href", "/app/users");
    expect(screen.getByTestId("mobile-primary-create")).toHaveAttribute(
      "href",
      "/app/workspaces/new",
    );
    expect(screen.getByTestId("mobile-primary-create")).toHaveAccessibleName("Create workspace");
  });

  it("keeps every agency settings section reachable from More", async () => {
    usePathnameMock.mockReturnValue("/app/agency-settings/storage");
    const user = userEvent.setup();
    render(<MobileNav {...baseProps} canAccessTrendRadar />);

    await user.click(screen.getByTestId("mobile-navigation-more"));

    expect(screen.getByRole("link", { name: "Agency settings" })).toHaveAttribute(
      "href",
      "/app/agency-settings",
    );
    expect(screen.getByRole("link", { name: "Plan and usage" })).toHaveAttribute(
      "href",
      "/app/agency-settings/plan",
    );
    expect(screen.getByRole("link", { name: "AI configuration" })).toHaveAttribute(
      "href",
      "/app/agency-settings/ai",
    );
    expect(screen.getByRole("link", { name: "Social analytics" })).toHaveAttribute(
      "href",
      "/app/agency-settings/social",
    );
    expect(screen.getByRole("link", { name: "Social provider setup" })).toHaveAttribute(
      "href",
      "/app/agency-settings/social/providers",
    );
    expect(screen.getByRole("link", { name: "Media storage" })).toHaveAttribute(
      "href",
      "/app/agency-settings/storage",
    );
    expect(screen.getByRole("link", { name: "Trend sources" })).toHaveAttribute(
      "href",
      "/app/agency-settings/trend-sources",
    );
  });

  it("keeps the global Work destinations reachable from More", async () => {
    usePathnameMock.mockReturnValue("/app/tasks");
    const user = userEvent.setup();
    render(<MobileNav {...baseProps} />);

    await user.click(screen.getByTestId("mobile-navigation-more"));

    // Round-4a parity: on global routes the mobile sheet shows
    // BOTH a Personal section (My tasks) and a Global section
    // (All tasks + Global calendar). My tasks is personal
    // regardless of context, so it must stay reachable here.
    expect(screen.getByRole("link", { name: "My tasks" })).toHaveAttribute(
      "href",
      "/app/tasks/mine",
    );
    expect(screen.getByRole("link", { name: "All tasks" })).toHaveAttribute("href", "/app/tasks");
    expect(screen.getByRole("link", { name: "Global calendar" })).toHaveAttribute(
      "href",
      "/app/calendar",
    );
    expect(screen.getByRole("link", { name: "All tasks" })).toHaveAttribute("aria-current", "page");
  });

  it("uses content creation inside a workspace and exposes secondary routes in More", async () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/planning");
    const user = userEvent.setup();
    render(<MobileNav {...baseProps} canAccessTrendRadar />);

    expect(screen.getByRole("link", { name: "Command Center" })).toHaveAttribute(
      "href",
      "/app/a/acme/w/northstar",
    );
    expect(screen.getByRole("link", { name: "Planning" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();
    expect(screen.queryByRole("link", { name: "Workspaces" })).toBeNull();

    await user.click(screen.getByTestId("mobile-navigation-more"));
    expect(screen.getByRole("dialog", { name: "Navigate" })).toBeInTheDocument();
    for (const label of [
      "Design queue",
      "Library",
      "Media",
      "Social channels",
      "Brand kit",
      "Team",
      "Settings",
      "AI assistance",
      "Trend Radar",
      "Trend settings",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: "Board" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Calendar" })).toBeNull();
  });

  it("marks the current secondary workspace route active in More", async () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/settings/trends");
    const user = userEvent.setup();
    render(<MobileNav {...baseProps} canAccessTrendRadar />);

    await user.click(screen.getByTestId("mobile-navigation-more"));

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Trend settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("link", { name: "Board" })).toBeNull();
  });

  it("marks the current platform route active in More", async () => {
    usePathnameMock.mockReturnValue("/app/platform/agencies/agency-1");
    const user = userEvent.setup();
    render(<MobileNav {...baseProps} platformAccess={ownerAccess} />);

    await user.click(screen.getByTestId("mobile-navigation-more"));

    expect(screen.getByRole("link", { name: "Agencies" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Platform overview" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("removes the generic create action from the workflow board", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/board");
    render(<MobileNav {...baseProps} />);

    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();
  });

  it("removes the generic create action from content detail", () => {
    usePathnameMock.mockReturnValue(
      "/app/a/acme/w/northstar/planning/9f8c7d6e-5b4a-4321-9876-123456789abc",
    );
    render(<MobileNav {...baseProps} />);

    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();
  });

  it("removes the generic create action from publishing", () => {
    usePathnameMock.mockReturnValue(
      "/app/a/acme/w/northstar/planning/9f8c7d6e-5b4a-4321-9876-123456789abc/publish",
    );
    render(<MobileNav {...baseProps} />);

    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();
  });

  it("removes the generic create action from Reviews", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/reviews");
    render(<MobileNav {...baseProps} />);

    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();
  });

  it("removes the generic create action from workspace Settings", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/settings");
    render(<MobileNav {...baseProps} />);

    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();
  });

  it("removes the generic create action from Media", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/media");
    render(<MobileNav {...baseProps} />);

    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();
  });

  it("does not fall back to workspace creation on an unresolved workspace route", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/unknown/media");
    render(<MobileNav {...baseProps} workspaces={[]} />);

    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();
  });

  it("removes the generic create action from Trend Radar", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/trends");
    render(<MobileNav {...baseProps} canAccessTrendRadar />);

    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();
  });

  it("removes the generic create action from Brand Kit", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar/brand-kit");
    render(<MobileNav {...baseProps} />);

    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();
  });

  it.each([
    ["Social channels", "/app/a/acme/w/northstar/channels"],
    ["Social analytics", "/app/a/acme/w/northstar/analytics/social"],
    ["Design queue", "/app/a/acme/w/northstar/design-queue"],
    ["Planning library", "/app/a/acme/w/northstar/library"],
  ])("removes the generic create action from %s", (_label, pathname) => {
    usePathnameMock.mockReturnValue(pathname);
    render(<MobileNav {...baseProps} />);

    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();
  });

  it.each([
    ["Account", "/app/account"],
    ["Agency Settings", "/app/agency-settings"],
    ["Agency AI", "/app/agency-settings/ai"],
    ["People", "/app/users"],
    ["Global Media", "/app/media"],
    ["New workspace", "/app/workspaces/new"],
  ])("removes the unrelated workspace create action from %s", (_label, pathname) => {
    usePathnameMock.mockReturnValue(pathname);
    render(<MobileNav {...baseProps} />);

    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();
  });

  it("keeps client navigation restricted and removes the create action", async () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/autumn/client");
    const user = userEvent.setup();
    render(<MobileNav {...baseProps} />);

    expect(screen.getByRole("link", { name: "Reviews" })).toHaveAttribute(
      "href",
      "/app/a/acme/w/autumn/client",
    );
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      "/app/a/acme/w/autumn/client/calendar",
    );
    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();

    await user.click(screen.getByTestId("mobile-navigation-more"));
    expect(screen.queryByRole("link", { name: "Brand kit" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    expect(screen.getByRole("link", { name: "Account" })).toBeInTheDocument();
  });

  it("does not advertise content creation to a read-only internal actor", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar");
    render(
      <MobileNav
        {...baseProps}
        user={{ isAdmin: false }}
        workspaceCanCreateContent={{ "ws-1": false, "ws-2": false }}
      />,
    );
    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();
  });

  it("keeps the Overview to one primary create action", () => {
    usePathnameMock.mockReturnValue("/app/a/acme/w/northstar");
    render(<MobileNav {...baseProps} />);

    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();
  });

  it.each([
    ["Owner", ownerAccess, true, true],
    [
      "Agency Operator",
      { ...ownerAccess, canReadSecurity: false, canReadAccess: false },
      false,
      false,
    ],
    ["Auditor", ownerAccess, true, true],
    ["Support", { ...ownerAccess, canReadAccess: false }, true, false],
  ])(
    "renders the %s platform destinations in More",
    async (_label, access, security, accessPage) => {
      usePathnameMock.mockReturnValue("/app/platform/overview");
      const user = userEvent.setup();
      render(<MobileNav {...baseProps} platformAccess={access as typeof ownerAccess} />);
      await user.click(screen.getByTestId("mobile-navigation-more"));
      expect(screen.getByRole("link", { name: /^Agencies$/i })).toBeInTheDocument();
      expect(!!screen.queryByRole("link", { name: /Security and support/i })).toBe(security);
      expect(!!screen.queryByRole("link", { name: /Platform access/i })).toBe(accessPage);
    },
  );
});
