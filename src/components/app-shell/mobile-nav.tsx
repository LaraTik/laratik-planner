"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, ClipboardList, Home, LayoutDashboard, Plus } from "lucide-react";
import { cn, isActivePath } from "@/lib/utils";

/**
 * Mobile bottom navigation (master prompt §3: "Mobile <768px: bottom
 * navigation"). Hidden on tablet+ (md:hidden).
 *
 * Workspace-aware: when the user is inside /app/w/[slug]/*, the
 * mobile nav shows the most important workspace tabs (Overview,
 * Planning). On a global page, it shows My Work and Workspaces.
 *
 * The "+" tile is only shown to admins (per master prompt §17) and
 * always links to the create-workspace page. The full workspace nav
 * lives in the sidebar; on mobile (< 768px) the sidebar is hidden,
 * so the bottom nav is the primary navigation surface.
 */
export function MobileNav({ canCreate }: { canCreate: boolean }) {
  const pathname = usePathname();
  const slugMatch = pathname.match(/^\/app\/w\/([^/]+)/);
  const inWorkspace = !!slugMatch;
  const wsBase = slugMatch ? `/app/w/${slugMatch[1]}` : "";

  return (
    <nav
      className="bg-surface border-border fixed inset-x-0 bottom-0 z-30 border-t md:hidden"
      aria-label="Primary"
    >
      <ul className={cn("grid gap-1 px-2 py-2", canCreate ? "grid-cols-4" : "grid-cols-3")}>
        <li>
          <Link
            href="/app"
            aria-current={isActivePath("/app", pathname, { exact: true }) ? "page" : undefined}
            className={cn(
              "text-label focus-visible:ring-focus-ring flex min-h-[var(--control-touch)] flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-2 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
              isActivePath("/app", pathname, { exact: true })
                ? "bg-primary-subtle text-primary"
                : "text-fg-secondary hover:bg-surface-subtle",
            )}
          >
            <Home className="h-5 w-5" aria-hidden="true" />
            <span>My Work</span>
          </Link>
        </li>
        {inWorkspace ? (
          <>
            <li>
              <Link
                href={wsBase}
                aria-current={isActivePath(wsBase, pathname, { exact: true }) ? "page" : undefined}
                className={cn(
                  "text-label focus-visible:ring-focus-ring flex min-h-[var(--control-touch)] flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-2 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
                  isActivePath(wsBase, pathname, { exact: true })
                    ? "bg-primary-subtle text-primary"
                    : "text-fg-secondary hover:bg-surface-subtle",
                )}
              >
                <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
                <span>Overview</span>
              </Link>
            </li>
            <li>
              <Link
                href={`${wsBase}/planning`}
                aria-current={isActivePath(`${wsBase}/planning`, pathname) ? "page" : undefined}
                className={cn(
                  "text-label focus-visible:ring-focus-ring flex min-h-[var(--control-touch)] flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-2 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
                  isActivePath(`${wsBase}/planning`, pathname)
                    ? "bg-primary-subtle text-primary"
                    : "text-fg-secondary hover:bg-surface-subtle",
                )}
              >
                <ClipboardList className="h-5 w-5" aria-hidden="true" />
                <span>Planning</span>
              </Link>
            </li>
          </>
        ) : (
          <li>
            <Link
              href="/app/workspaces"
              aria-current={isActivePath("/app/workspaces", pathname) ? "page" : undefined}
              className={cn(
                "text-label focus-visible:ring-focus-ring flex min-h-[var(--control-touch)] flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-2 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
                isActivePath("/app/workspaces", pathname)
                  ? "bg-primary-subtle text-primary"
                  : "text-fg-secondary hover:bg-surface-subtle",
              )}
            >
              <Briefcase className="h-5 w-5" aria-hidden="true" />
              <span>Workspaces</span>
            </Link>
          </li>
        )}
        {canCreate ? (
          <li>
            <Link
              href="/app/workspaces/new"
              className="text-label text-fg-secondary hover:bg-surface-subtle focus-visible:ring-focus-ring flex min-h-[var(--control-touch)] flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-2 font-semibold focus:outline-none focus-visible:ring-2"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
              <span>New</span>
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
