import { describe, expect, it } from "vitest";
import {
  buildAgencyNavigation,
  buildClientReviewerNavigation,
  buildWorkspaceNavigation,
} from "@/components/app-shell/navigation-model";

/**
 * Tests for the typed navigation model that powers the
 * /ui-ux-pro-max sidebar. The renderer (Sidebar.tsx) is a
 * thin dispatch over this data; locking the shape down
 * prevents drift between the model and the rendered nav.
 */

const wsBase = "/app/w/acme";

describe("buildWorkspaceNavigation", () => {
  it("returns Overview as the top item, then grouped Content/Performance/Brand/Manage", () => {
    const nav = buildWorkspaceNavigation({
      wsBase,
      badges: {},
      canCreateContent: true,
      canManage: true,
    });
    expect(nav.top).toHaveLength(1);
    expect(nav.top[0]?.key).toBe("overview");
    const groupKeys = nav.groups.map((g) => g.key);
    expect(groupKeys).toEqual(["content", "performance", "brand", "manage"]);
  });

  it("omits the Manage group for non-managers (viewer role)", () => {
    const nav = buildWorkspaceNavigation({
      wsBase,
      badges: {},
      canCreateContent: false,
      canManage: false,
    });
    expect(nav.groups.map((g) => g.key)).toEqual(["content", "performance", "brand"]);
  });

  it("exposes the workspace's Create content href only when the actor can create", () => {
    const writerNav = buildWorkspaceNavigation({
      wsBase,
      badges: {},
      canCreateContent: true,
      canManage: true,
    });
    expect(writerNav.createContentHref).toBe(`${wsBase}/planning/new`);
    const viewerNav = buildWorkspaceNavigation({
      wsBase,
      badges: {},
      canCreateContent: false,
      canManage: false,
    });
    expect(viewerNav.createContentHref).toBeNull();
  });

  it("propagates actionable badge counts to the matching nav items", () => {
    const nav = buildWorkspaceNavigation({
      wsBase,
      badges: { approvals: 3, designQueue: 2 },
      canCreateContent: true,
      canManage: true,
    });
    const findItem = (key: string) => {
      for (const g of nav.groups) {
        for (const item of g.items) {
          if (item.key === key) return item;
          if (item.kind === "expandable") {
            for (const c of item.children) {
              if (c.key === key) return c;
            }
          }
        }
      }
      return null;
    };
    const approvals = findItem("approvals");
    const designQueue = findItem("design-queue");
    expect(approvals).not.toBeNull();
    expect(designQueue).not.toBeNull();
    if (approvals?.kind === "link") expect(approvals.badge).toBe(3);
    if (designQueue?.kind === "link") expect(designQueue.badge).toBe(2);
  });

  it("preserves the deep-link routes (no URL changes for content destinations)", () => {
    const nav = buildWorkspaceNavigation({
      wsBase,
      badges: {},
      canCreateContent: false,
      canManage: false,
    });
    const allHrefs: string[] = [];
    for (const g of nav.groups) {
      for (const item of g.items) {
        if (item.kind === "link") allHrefs.push(item.href);
        if (item.kind === "expandable") {
          allHrefs.push(item.href);
          for (const c of item.children) {
            if (c.kind === "link") allHrefs.push(c.href);
          }
        }
      }
    }
    // The two well-known deep-link targets must remain
    expect(allHrefs).toContain(`${wsBase}/reviews`); // approvals (URL alias)
    expect(allHrefs).toContain(`${wsBase}/design-queue`);
    expect(allHrefs).toContain(`${wsBase}/library`);
    expect(allHrefs).toContain(`${wsBase}/channels`);
    expect(allHrefs).toContain(`${wsBase}/analytics/social`);
  });
});

describe("buildAgencyNavigation", () => {
  it("returns My work + Workspaces for a non-admin, non-platform user", () => {
    const nav = buildAgencyNavigation({
      isAdmin: false,
      platformAccess: {
        canEnter: false,
        canReadAgencies: false,
        canReadSecurity: false,
        canReadAccess: false,
      },
    });
    expect(nav.top[0]?.key).toBe("my-work");
    expect(nav.groups.map((g) => g.key)).toEqual(["agency"]);
  });

  it("adds the Admin group for agency admins", () => {
    const nav = buildAgencyNavigation({
      isAdmin: true,
      platformAccess: {
        canEnter: false,
        canReadAgencies: false,
        canReadSecurity: false,
        canReadAccess: false,
      },
    });
    expect(nav.groups.map((g) => g.key)).toContain("admin");
  });

  it("adds the Platform group for platform admins and respects per-page gates", () => {
    const nav = buildAgencyNavigation({
      isAdmin: false,
      platformAccess: {
        canEnter: true,
        canReadAgencies: true,
        canReadSecurity: false,
        canReadAccess: false,
      },
    });
    const platformGroup = nav.groups.find((g) => g.key === "platform");
    expect(platformGroup).toBeDefined();
    if (platformGroup) {
      const keys = platformGroup.items.filter((i) => i.kind === "link").map((i) => i.key);
      expect(keys).toContain("platform-overview");
      expect(keys).toContain("platform-agencies");
      // Security & Access are gated off in this matrix
      expect(keys).not.toContain("platform-security");
      expect(keys).not.toContain("platform-access");
      expect(keys).toContain("platform-errors");
    }
  });
});

describe("buildClientReviewerNavigation", () => {
  it("returns only the client review + calendar surface", () => {
    const nav = buildClientReviewerNavigation({ wsBase });
    expect(nav.top.map((i) => i.key)).toEqual(["client-review", "client-calendar"]);
    for (const item of nav.top) {
      expect(item.href).toContain("/client");
    }
  });
});
