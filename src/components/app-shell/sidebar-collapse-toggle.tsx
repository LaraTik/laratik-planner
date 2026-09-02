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
 */
export function SidebarCollapseToggle({
  collapsed,
  variant = "header",
}: {
  collapsed: boolean;
  variant?: "header" | "footer";
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

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

  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";

  if (variant === "footer") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        data-testid="sidebar-collapse-toggle"
        className={cn(
          "text-fg-secondary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2",
        )}
        disabled={pending}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
        ) : (
          <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid="sidebar-collapse-toggle"
      className={cn(
        "text-fg-secondary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2",
      )}
      disabled={pending}
    >
      {collapsed ? (
        <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
      ) : (
        <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
