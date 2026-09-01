import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Sidebar } from "@/components/app-shell/sidebar";

/**
 * Regression for the "React #441 more hooks than during the previous render"
 * bug that surfaces on /app/workspaces after the user (same actor) switches
 * between agencies. The page is a Server Component; the layout persists
 * across navigations and re-renders the Sidebar with new agency data.
 *
 * This test simulates the data flow:
 *   1. Mount the Sidebar with agency A's data.
 *   2. Re-render with agency B's data.
 *   3. Assert no exception was thrown (no React #441).
 */

const usePathnameMock = vi.fn<() => string>(() => "/app/workspaces");
const pushMock = vi.fn<(href: string) => void>(() => {});
const refreshMock = vi.fn<() => void>(() => {});

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

type SwitchRedirectResult =
  | { ok: true; agencyId: string; firstWorkspaceSlug: string | null }
  | { ok: false; reason: "unauthenticated" | "not-a-member" | "no-secret" };

const switchActiveAgencyAndRedirectMock = vi.hoisted(() =>
  vi.fn(async (agencyId: string): Promise<SwitchRedirectResult> => ({
    ok: true as const,
    agencyId,
    firstWorkspaceSlug: null as string | null,
  })),
);
vi.mock("@/lib/auth/agency-actions", () => ({
  switchActiveAgencyAndRedirect: switchActiveAgencyAndRedirectMock,
}));

function makeProps(agencyId: string, agencyName: string) {
  return {
    user: { name: "Lara", isAdmin: true },
    workspaces: [{ id: `ws-${agencyId}-1`, name: `${agencyName} WS1`, slug: `ws-${agencyId}-1` }],
    workspaceAccess: { [`ws-${agencyId}-1`]: "internal" as const },
    workspaceCanCreateContent: { [`ws-${agencyId}-1`]: true },
    workspaceSwitcherOptions: [
      { id: `ws-${agencyId}-1`, name: `${agencyName} WS1`, slug: `ws-${agencyId}-1` },
    ],
    agencySwitcher: {
      active: { id: agencyId, name: agencyName, slug: agencyId, isAdmin: true },
      options: [
        { id: agencyId, name: agencyName, slug: agencyId, isAdmin: true },
        { id: "other-agency", name: "Other", slug: "other", isAdmin: false },
      ],
    },
    canCreateWorkspace: true,
    platformAccess: {
      canEnter: false,
      canReadAgencies: false,
      canReadSecurity: false,
      canReadAccess: false,
    },
    workspaceBadgesByWorkspaceId: {},
    unreadAppErrors: 0,
    collapsed: false,
  };
}

beforeEach(() => {
  usePathnameMock.mockReset();
  usePathnameMock.mockReturnValue("/app/workspaces");
  pushMock.mockReset();
  refreshMock.mockReset();
});

describe("Sidebar under agency switch (React #441 regression)", () => {
  it("re-renders without throwing when the active agency changes", () => {
    const { rerender } = render(<Sidebar {...makeProps("agency-a", "Agency A")} />);

    // Re-render with the new agency context — simulates the layout
    // receiving a different activeAgency after a successful
    // switchActiveAgency + router.refresh().
    expect(() => rerender(<Sidebar {...makeProps("agency-b", "Agency B")} />)).not.toThrow();

    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });

  it("survives the active agency becoming null (e.g. cookie cleared mid-flow)", () => {
    const { rerender } = render(<Sidebar {...makeProps("agency-a", "Agency A")} />);

    expect(() =>
      rerender(
        <Sidebar
          {...makeProps("agency-a", "Agency A")}
          agencySwitcher={{ active: null, options: [] }}
        />,
      ),
    ).not.toThrow();
  });
});
