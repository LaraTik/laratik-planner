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
  switchActiveAgency: vi.fn(async () => true),
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

  it("uses content creation inside a workspace and exposes every secondary route in More", async () => {
    usePathnameMock.mockReturnValue("/app/w/northstar/planning");
    const user = userEvent.setup();
    render(<MobileNav {...baseProps} />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/app/w/northstar",
    );
    expect(screen.getByRole("link", { name: "Planning" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("mobile-primary-create")).toHaveAttribute(
      "href",
      "/app/w/northstar/planning/new",
    );
    expect(screen.queryByRole("link", { name: "Workspaces" })).toBeNull();

    await user.click(screen.getByTestId("mobile-navigation-more"));
    expect(screen.getByRole("dialog", { name: "Navigate" })).toBeInTheDocument();
    for (const label of [
      "Board",
      "Calendar",
      "Design queue",
      "Library",
      "Social channels",
      "Brand kit",
      "Team",
      "Settings",
      "AI assistance",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("keeps client navigation restricted and removes the create action", async () => {
    usePathnameMock.mockReturnValue("/app/w/autumn/client");
    const user = userEvent.setup();
    render(<MobileNav {...baseProps} />);

    expect(screen.getByRole("link", { name: "Reviews" })).toHaveAttribute(
      "href",
      "/app/w/autumn/client",
    );
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      "/app/w/autumn/client/calendar",
    );
    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();

    await user.click(screen.getByTestId("mobile-navigation-more"));
    expect(screen.queryByRole("link", { name: "Brand kit" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    expect(screen.getByRole("link", { name: "Account" })).toBeInTheDocument();
  });

  it("does not advertise content creation to a read-only internal actor", () => {
    usePathnameMock.mockReturnValue("/app/w/northstar");
    render(
      <MobileNav
        {...baseProps}
        user={{ isAdmin: false }}
        workspaceCanCreateContent={{ "ws-1": false, "ws-2": false }}
      />,
    );
    expect(screen.queryByTestId("mobile-primary-create")).toBeNull();
  });

  it.each([
    ["Owner", ownerAccess, true, true],
    ["Agency Operator", { ...ownerAccess, canReadSecurity: false, canReadAccess: false }, false, false],
    ["Auditor", ownerAccess, true, true],
    ["Support", { ...ownerAccess, canReadAccess: false }, true, false],
  ])("renders the %s platform destinations in More", async (_label, access, security, accessPage) => {
    usePathnameMock.mockReturnValue("/app/platform/overview");
    const user = userEvent.setup();
    render(<MobileNav {...baseProps} platformAccess={access as typeof ownerAccess} />);
    await user.click(screen.getByTestId("mobile-navigation-more"));
    expect(screen.getByRole("link", { name: /^Agencies$/i })).toBeInTheDocument();
    expect(!!screen.queryByRole("link", { name: /Security and support/i })).toBe(security);
    expect(!!screen.queryByRole("link", { name: /Platform access/i })).toBe(accessPage);
  });
});
