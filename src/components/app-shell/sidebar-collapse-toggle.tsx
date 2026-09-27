"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { setSidebarCollapsed } from "@/lib/nav/sidebar-actions";
import { cn } from "@/lib/utils";

/**
 * Sidebar collapse / expand toggle.
 *
 * The desktop sidebar is 248px expanded / 64px collapsed. The
 * user's choice is persisted in a cookie (see
 * `src/lib/nav/sidebar-preference.ts`) so a refresh / new tab
 * keeps the preference.
 *
 * Visual:
 *   - Expanded state → shows the toggle as a small icon button
 *     to the right of the workspace switcher.
 *   - Collapsed state → shows the toggle as a 44px square in the
 *     sidebar bottom.
 *
 * Click behavior:
 *   - Toggles the cookie via a server action.
 *   - Calls `router.refresh()` so the RSC layout re-renders with
 *     the new width class (the same pattern the agency switcher
 *     uses).
 *
 * Round-4b — bilingual + tablet distinction:
 *   The `aria-label` used to be a hardcoded English string, which
 *   violated the "no hard-coded user-facing copy in components"
 *   rule in AGENTS.md. The copy now arrives through the `labels`
 *   prop, threaded from the RSC layout's resolved catalog.
 *
 *   The label ALSO distinguishes *why* the rail is narrow, which
 *   is the whole point of round 4's IA cleanup. `isDesktop` is
 *   derived from `matchMedia("(min-width: 1280px)")` (Tailwind's
 *   `xl` breakpoint) inside the component:
 *     - below `xl` the rail is auto-collapsed by CSS regardless
 *       of the cookie → "Expand sidebar (tablet)". Tells the user
 *       the window caused the narrow rail, not their own choice.
 *     - at `xl`+ the cookie alone decides, so the plain
 *       expand / collapse string is correct.
 *   `isDesktop` starts as `true` so the server-rendered label is
 *   the stable plain one and hydration does not shift the
 *   accessible name unpredictably.
 */
export function SidebarCollapseToggle({
  collapsed,
  variant = "header",
  labels = {},
}: {
  collapsed: boolean;
  variant?: "header" | "footer";
  labels?: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(true);

  // Track the `xl` breakpoint so the label can say *why* the rail
  // is narrow. `true` during SSR (the server can't know the
  // viewport) so the first paint shows the stable plain label.
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 1280px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const onClick = async () => {
    if (pending) return;
    setPending(true);
    try {
      await setSidebarCollapsed(!collapsed);
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const expand = labels["expandSidebar"] ?? "Expand sidebar";
  const collapse = labels["collapseSidebar"] ?? "Collapse sidebar";
  const expandTablet = labels["expandSidebarTablet"] ?? "Expand sidebar (tablet)";
  // Only surface the tablet variant when the rail is narrow
  // because of the viewport. On a wide viewport the cookie alone
  // decides, so the plain string is correct there.
  const isTablet = !isDesktop;
  const label = isTablet ? expandTablet : collapsed ? expand : collapse;
  // The icon has to agree with the label. Below `xl` the rail is
  // visually collapsed by CSS, so the affordance the user sees is
  // "open the rail" even when the cookie says `collapsed: false`.
  const showOpenIcon = isTablet || collapsed;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid="sidebar-collapse-toggle"
      data-variant={variant}
      data-tablet-collapsed={isTablet ? "true" : undefined}
      className={cn(
        "text-fg-secondary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2",
      )}
      disabled={pending}
    >
      {showOpenIcon ? (
        <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
      ) : (
        <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
