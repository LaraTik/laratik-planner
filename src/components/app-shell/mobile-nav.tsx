"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Gauge,
  HelpCircle,
  Home,
  Kanban,
  LayoutDashboard,
  Library,
  Lock,
  Menu,
  MessageSquare,
  Package,
  Palette,
  Plus,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { cn, isActivePath } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { AgencySwitcher, type AgencyRow } from "./agency-switcher";

type Workspace = { id: string; name: string; slug: string };

type MobileNavProps = {
  user: { isAdmin: boolean };
  workspaces: Workspace[];
  workspaceAccess: Record<string, "internal" | "client" | "none">;
  workspaceCanCreateContent: Record<string, boolean>;
  agencySwitcher: { active: AgencyRow | null; options: AgencyRow[] };
  canCreateWorkspace: boolean;
  isPlatformAdmin: boolean;
};

/**
 * Mobile navigation uses stable primary destinations and a full More
 * sheet. Secondary workspace/admin routes remain reachable when the
 * desktop sidebar disappears below 768px.
 */
export function MobileNav({
  user,
  workspaces,
  workspaceAccess,
  workspaceCanCreateContent,
  agencySwitcher,
  canCreateWorkspace,
  isPlatformAdmin,
}: MobileNavProps) {
  const pathname = usePathname();
  const slug = pathname.match(/^\/app\/w\/([^/]+)/)?.[1];
  const currentWorkspace = slug
    ? (workspaces.find((workspace) => workspace.slug === slug) ?? null)
    : null;
  const wsBase = currentWorkspace ? `/app/w/${currentWorkspace.slug}` : "";
  const clientOnly = currentWorkspace ? workspaceAccess[currentWorkspace.id] === "client" : false;

  const primaryLinks: Array<{
    href: string;
    label: string;
    icon: ReactNode;
    active: boolean;
  }> = currentWorkspace
    ? clientOnly
      ? [
          mobileLink("/app", "My Work", <Home />, pathname, true),
          mobileLink(`${wsBase}/client`, "Reviews", <MessageSquare />, pathname, true),
          mobileLink(`${wsBase}/client/calendar`, "Calendar", <CalendarDays />, pathname),
        ]
      : [
          mobileLink("/app", "My Work", <Home />, pathname, true),
          mobileLink(wsBase, "Overview", <LayoutDashboard />, pathname, true),
          mobileLink(`${wsBase}/planning`, "Planning", <ClipboardList />, pathname),
          mobileLink(`${wsBase}/reviews`, "Reviews", <MessageSquare />, pathname),
        ]
    : [
        mobileLink("/app", "My Work", <Home />, pathname, true),
        mobileLink("/app/workspaces", "Workspaces", <Briefcase />, pathname),
        ...(user.isAdmin ? [mobileLink("/app/users", "People", <Users />, pathname)] : []),
      ];

  const createHref = currentWorkspace
    ? !clientOnly && workspaceCanCreateContent[currentWorkspace.id]
      ? `${wsBase}/planning/new`
      : null
    : canCreateWorkspace
      ? "/app/workspaces/new"
      : null;
  const createLabel = currentWorkspace ? "Create content" : "Create workspace";

  return (
    <>
      <Dialog>
        <nav
          className="bg-surface border-border fixed inset-x-0 bottom-0 z-30 border-t pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
          aria-label="Primary"
          data-testid="mobile-navigation"
        >
          <ul
            className="grid gap-1 px-2 pt-2"
            style={{ gridTemplateColumns: `repeat(${primaryLinks.length + 1}, minmax(0, 1fr))` }}
          >
            {primaryLinks.map((item) => (
              <li key={item.href}>
                <BottomNavLink {...item} />
              </li>
            ))}
            <li>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="text-label text-fg-secondary hover:bg-surface-subtle focus-visible:ring-focus-ring flex min-h-[var(--control-touch)] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-1 font-semibold transition-colors focus:outline-none focus-visible:ring-2"
                  aria-label="Open all navigation"
                  data-testid="mobile-navigation-more"
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                  <span>More</span>
                </button>
              </DialogTrigger>
            </li>
          </ul>
        </nav>

        <DialogContent className="inset-x-0 top-auto bottom-0 left-0 max-h-[min(86dvh,760px)] w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-t-[var(--radius-card)] rounded-b-none p-0 md:hidden">
          <DialogHeader className="border-border border-b px-4 py-4 pr-14">
            <DialogTitle>Navigate</DialogTitle>
            <DialogDescription>
              {currentWorkspace ? currentWorkspace.name : "Agency and platform destinations"}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="border-border bg-surface-subtle mb-5 grid gap-2 rounded-[var(--radius-card)] border p-3">
              <AgencySwitcher
                active={agencySwitcher.active}
                options={agencySwitcher.options}
                isPlatformAdmin={isPlatformAdmin}
                testId="mobile-agency-switcher-trigger"
              />
              <WorkspaceSwitcher
                active={currentWorkspace ?? workspaces[0] ?? null}
                options={workspaces}
                canCreate={canCreateWorkspace}
                testId="mobile-workspace-switcher-trigger"
              />
            </div>

            {currentWorkspace && !clientOnly ? (
              <MenuSection label="Workspace">
                <MobileMenuLink href={`${wsBase}/board`} icon={<Kanban />} label="Board" />
                <MobileMenuLink
                  href={`${wsBase}/calendar`}
                  icon={<CalendarDays />}
                  label="Calendar"
                />
                <MobileMenuLink
                  href={`${wsBase}/design-queue`}
                  icon={<Palette />}
                  label="Design queue"
                />
                <MobileMenuLink href={`${wsBase}/library`} icon={<Library />} label="Library" />
                <MobileMenuLink
                  href={`${wsBase}/channels`}
                  icon={<Share2 />}
                  label="Social channels"
                />
                <MobileMenuLink href={`${wsBase}/brand-kit`} icon={<Package />} label="Brand kit" />
                <MobileMenuLink href={`${wsBase}/team`} icon={<Users />} label="Team" />
                <MobileMenuLink href={`${wsBase}/settings`} icon={<Settings />} label="Settings" />
                <MobileMenuLink
                  href={`${wsBase}/ai-settings`}
                  icon={<Bot />}
                  label="AI assistance"
                />
              </MenuSection>
            ) : null}

            {user.isAdmin && !currentWorkspace ? (
              <MenuSection label="Agency">
                <MobileMenuLink href="/app/users" icon={<Users />} label="User management" />
                <MobileMenuLink
                  href="/app/agency-settings"
                  icon={<Shield />}
                  label="Agency settings"
                />
                <MobileMenuLink
                  href="/app/agency-settings/plan"
                  icon={<Gauge />}
                  label="Plan and usage"
                />
                <MobileMenuLink
                  href="/app/agency-settings/ai"
                  icon={<Bot />}
                  label="AI configuration"
                />
              </MenuSection>
            ) : null}

            {isPlatformAdmin && !currentWorkspace ? (
              <MenuSection label="Platform">
                <MobileMenuLink
                  href="/app/platform/overview"
                  icon={<LayoutDashboard />}
                  label="Platform overview"
                />
                <MobileMenuLink href="/app/platform/agencies" icon={<Shield />} label="Agencies" />
                <MobileMenuLink
                  href="/app/platform/security"
                  icon={<Lock />}
                  label="Security and support"
                />
                <MobileMenuLink
                  href="/app/platform/admins"
                  icon={<ShieldCheck />}
                  label="Platform admins"
                />
              </MenuSection>
            ) : null}

            <MenuSection label="Personal">
              <MobileMenuLink href="/app/account" icon={<UserRound />} label="Account" />
              <MobileMenuLink
                href="https://github.com/LaraTik/laratik-planner"
                icon={<HelpCircle />}
                label="Help"
              />
            </MenuSection>
          </div>
        </DialogContent>
      </Dialog>

      {createHref ? (
        <Link
          href={createHref}
          className="bg-primary hover:bg-primary-hover focus-visible:ring-focus-ring fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex h-14 min-h-14 w-14 min-w-14 items-center justify-center rounded-full text-white shadow-lg transition-colors focus:outline-none focus-visible:ring-2 md:hidden"
          aria-label={createLabel}
          title={createLabel}
          data-testid="mobile-primary-create"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </Link>
      ) : null}
    </>
  );
}

function mobileLink(href: string, label: string, icon: ReactNode, pathname: string, exact = false) {
  return { href, label, icon, active: isActivePath(href, pathname, { exact }) };
}

function BottomNavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-label focus-visible:ring-focus-ring flex min-h-[var(--control-touch)] flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-1 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
        active ? "bg-primary-subtle text-primary" : "text-fg-secondary hover:bg-surface-subtle",
      )}
    >
      <span className="[&>svg]:h-5 [&>svg]:w-5" aria-hidden="true">
        {icon}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

function MenuSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h2 className="text-label text-fg-muted mb-2 font-semibold tracking-wide uppercase">
        {label}
      </h2>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

function MobileMenuLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <DialogClose asChild>
      <Link
        href={href}
        className="border-border bg-surface text-body text-fg-primary hover:border-primary hover:bg-primary-subtle focus-visible:ring-focus-ring flex min-h-14 items-center gap-3 rounded-[var(--radius-control)] border px-3 font-semibold transition-colors focus:outline-none focus-visible:ring-2"
      >
        <span
          className="bg-surface-subtle text-fg-secondary flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] [&>svg]:h-4 [&>svg]:w-4"
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="min-w-0 break-words">{label}</span>
      </Link>
    </DialogClose>
  );
}
