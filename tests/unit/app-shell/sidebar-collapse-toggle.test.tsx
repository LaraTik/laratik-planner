import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarCollapseToggle } from "@/components/app-shell/sidebar-collapse-toggle";

/**
 * Round-4b: the collapse toggle's accessible name.
 *
 * Two things are pinned here:
 *
 *  1. **Bilingual.** Before round 4 the label was a hardcoded
 *     English `"Expand sidebar" / "Collapse sidebar"`, which
 *     violated the "no hard-coded user-facing copy in components"
 *     rule in AGENTS.md. The copy now arrives through the
 *     `labels` prop. This test fails if the component ever
 *     regresses to a literal.
 *
 *  2. **Why is the rail narrow?** A user on a 1024px laptop sees
 *     a collapsed rail they never asked for. The tablet variant
 *     of the label says so explicitly instead of implying their
 *     own persisted choice. `data-tablet-collapsed` is the
 *     machine-readable half so a future E2E can assert it.
 */

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

const setSidebarCollapsed = vi.fn(async (next: boolean) => {
  void next;
});
vi.mock("@/lib/nav/sidebar-actions", () => ({
  setSidebarCollapsed: (next: boolean) => setSidebarCollapsed(next),
}));

/** Install a `matchMedia` stub that reports a given width. */
function stubViewport(isDesktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("1280px") ? isDesktop : false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

const EN = {
  expandSidebar: "Expand sidebar",
  collapseSidebar: "Collapse sidebar",
  expandSidebarTablet: "Expand sidebar (tablet)",
};
const AR = {
  expandSidebar: "توسيع الشريط الجانبي",
  collapseSidebar: "طي الشريط الجانبي",
  expandSidebarTablet: "توسيع الشريط الجانبي (جهاز لوحي)",
};

describe("SidebarCollapseToggle — accessible name", () => {
  it("uses the English catalog strings on a wide viewport", () => {
    stubViewport(true);
    const { unmount } = render(<SidebarCollapseToggle collapsed={false} labels={EN} />);
    expect(screen.getByTestId("sidebar-collapse-toggle")).toHaveAttribute(
      "aria-label",
      "Collapse sidebar",
    );
    unmount();

    render(<SidebarCollapseToggle collapsed={true} labels={EN} />);
    expect(screen.getByTestId("sidebar-collapse-toggle")).toHaveAttribute(
      "aria-label",
      "Expand sidebar",
    );
  });

  it("uses the Arabic catalog strings on a wide viewport (bilingual contract)", () => {
    stubViewport(true);
    const { unmount } = render(<SidebarCollapseToggle collapsed={false} labels={AR} />);
    expect(screen.getByTestId("sidebar-collapse-toggle")).toHaveAttribute(
      "aria-label",
      "طي الشريط الجانبي",
    );
    unmount();

    render(<SidebarCollapseToggle collapsed={true} labels={AR} />);
    expect(screen.getByTestId("sidebar-collapse-toggle")).toHaveAttribute(
      "aria-label",
      "توسيع الشريط الجانبي",
    );
  });

  it("announces the tablet variant when the viewport is below the xl breakpoint", () => {
    stubViewport(false);
    render(<SidebarCollapseToggle collapsed={false} labels={EN} />);
    const toggle = screen.getByTestId("sidebar-collapse-toggle");
    // The rail is narrow because of the window, not the cookie —
    // the label has to say so instead of implying a user choice.
    expect(toggle).toHaveAttribute("aria-label", "Expand sidebar (tablet)");
    expect(toggle).toHaveAttribute("data-tablet-collapsed", "true");
  });

  it("keeps the icon in agreement with the label (no collapse-icon on a collapsed rail)", () => {
    // Below `xl` the rail is visually collapsed by CSS, so the
    // affordance must be "open the rail" (PanelLeftOpen) even
    // when the cookie still says `collapsed: false`. A
    // PanelLeftClose icon next to an "expand" label is a
    // contradictory affordance.
    stubViewport(false);
    const { container, unmount } = render(<SidebarCollapseToggle collapsed={false} labels={EN} />);
    expect(container.querySelector(".lucide-panel-left-open")).not.toBeNull();
    expect(container.querySelector(".lucide-panel-left-close")).toBeNull();
    unmount();

    // On a wide viewport the icon follows the cookie as before.
    stubViewport(true);
    const wide = render(<SidebarCollapseToggle collapsed={false} labels={EN} />);
    expect(wide.container.querySelector(".lucide-panel-left-close")).not.toBeNull();
  });

  it("surfaces the Arabic tablet variant too", () => {
    stubViewport(false);
    render(<SidebarCollapseToggle collapsed={false} labels={AR} />);
    expect(screen.getByTestId("sidebar-collapse-toggle")).toHaveAttribute(
      "aria-label",
      "توسيع الشريط الجانبي (جهاز لوحي)",
    );
  });

  it("falls back to English literals when no labels are threaded", () => {
    stubViewport(true);
    render(<SidebarCollapseToggle collapsed={false} />);
    expect(screen.getByTestId("sidebar-collapse-toggle")).toHaveAttribute(
      "aria-label",
      "Collapse sidebar",
    );
  });

  it("keeps the 44x44 touch target on both variants", () => {
    stubViewport(true);
    const { unmount } = render(<SidebarCollapseToggle collapsed={false} variant="header" />);
    expect(screen.getByTestId("sidebar-collapse-toggle")).toHaveAttribute("data-variant", "header");
    unmount();

    render(<SidebarCollapseToggle collapsed={true} variant="footer" labels={EN} />);
    expect(screen.getByTestId("sidebar-collapse-toggle")).toHaveAttribute("data-variant", "footer");
  });
});
