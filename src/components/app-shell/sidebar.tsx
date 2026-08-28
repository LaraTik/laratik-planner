"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertOctagon,
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Bot,
  Briefcase,
  CalendarDays,
  ClipboardList,
  History,
  Home,
  Image as ImageIcon,
  Kanban,
  LayoutDashboard,
  Library,
  MessageCircle,
  MessageSquare,
  Package,
  Palette,
  Plus,
  Settings,
  Tag,
  Gauge,
  Link as LinkIcon,
  Share2,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  Lock,
} from "lucide-react";
import { isActivePath } from "@/lib/utils";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { AgencySwitcher, type AgencyRow } from "./agency-switcher";
import { NestedSidebarGroup, SidebarGroup, SidebarLink, SidebarSubLink } from "./sidebar-group";
import type { PlatformNavigationAccess } from "@/lib/auth/platform-navigation-access";

/**
 * Primary navigation sidebar.
 *
 * Workspace-aware per the Stitch design (project 5403097764334458790).
 * The shape changes based on the current pathname:
 *
 *  - Inside /app/w/[slug]/* (workspace context):
 *      - Brand: logo + workspace name
 *      - My Work (global, top)
 *      - Workspace tabs (vertical): Overview, Planning, Calendar,
 *        Reviews, Social Channels, Social Analytics, Brand Kit, Team
 *      - Create content (primary button, bottom of nav)
 *      - Settings (expandable group): Lifecycle, Lead times,
 *        Assignment defaults, Approval mode, AI assistance
 *      - Context-aware create action and switchers (bottom)
 *
 *  - On a global page (/app, /app/workspaces, /app/users, ...):
 *      - Brand: logo only
 *      - My Work, Workspaces
 *      - (admin only) User Management, Agency Settings
 *        (with nested: General, AI configuration)
 *      - Workspace and agency switchers (bottom)
 *
 * The active path uses `isActivePath` from `src/lib/utils.ts` so the
 * active-state predicate stays consistent across the shell.
 *
 * Width: 248px expanded on desktop (per Stitch), 72px icon-rail on
 * tablet, hidden < 768px (MobileNav takes over).
 */
export function Sidebar({
  user,
  workspaces,
  workspaceAccess = {},
  workspaceCanCreateContent = {},
  workspaceSwitcherOptions,
  agencySwitcher,
  canCreateWorkspace,
  platformAccess,
}: {
  user: { name: string; isAdmin: boolean };
  workspaces: { id: string; slug: string; name: string }[];
  workspaceAccess?: Record<string, "internal" | "client" | "none">;
  workspaceCanCreateContent?: Record<string, boolean>;
  workspaceSwitcherOptions: { id: string; name: string; slug: string }[];
  agencySwitcher: { active: AgencyRow | null; options: AgencyRow[] };
  canCreateWorkspace: boolean;
  platformAccess: PlatformNavigationAccess;
}) {
  const pathname = usePathname();

  // Detect workspace context from the URL. /app/w/[slug]/* means we
  // are inside a workspace; everything else under /app is global.
  const slugMatch = pathname.match(/^\/app\/w\/([^/]+)/);
  const currentWorkspace = slugMatch
    ? (workspaces.find((w) => w.slug === slugMatch[1]) ?? null)
    : null;
  const inWorkspace = currentWorkspace !== null;
  const wsBase = currentWorkspace ? `/app/w/${currentWorkspace.slug}` : "";
  const clientOnly = currentWorkspace ? workspaceAccess[currentWorkspace.id] === "client" : false;
  const canCreateContent = currentWorkspace
    ? workspaceCanCreateContent[currentWorkspace.id] === true
    : false;
  const planningActive = Boolean(
    currentWorkspace &&
    (isActivePath(`${wsBase}/planning`, pathname) ||
      isActivePath(`${wsBase}/board`, pathname) ||
      isActivePath(`${wsBase}/calendar`, pathname)),
  );
  const hash = React.useSyncExternalStore(subscribeToHash, readHash, () => "");

  return (
    <nav className="flex h-full flex-col" aria-label="Primary">
      {/* Brand */}
      <div className="flex h-14 items-center justify-center px-2 xl:justify-start xl:px-6">
        <Link
          href="/app"
          className="focus-visible:ring-focus-ring flex items-center gap-3 rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2"
          aria-label="StudioFlow home"
          title="StudioFlow"
        >
          <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] font-bold text-white">
            S
          </div>
          <div className="hidden min-w-0 xl:block">
            <p className="text-section-title text-fg-primary truncate font-semibold">StudioFlow</p>
          </div>
        </Link>
      </div>

      {/* Top section: My Work + (workspace tabs OR global items) */}
      <div className="flex-1 space-y-1 overflow-y-auto px-2 xl:px-4">
        <SidebarLink
          href="/app"
          icon={<Home className="h-4 w-4" />}
          active={isActivePath("/app", pathname, { exact: true })}
        >
          My Work
        </SidebarLink>

        {inWorkspace && currentWorkspace ? (
          <div className="space-y-1 pt-1">
            {clientOnly ? (
              <>
                <SidebarLink
                  href={`${wsBase}/client`}
                  icon={<MessageSquare className="h-4 w-4" />}
                  active={isActivePath(`${wsBase}/client`, pathname, { exact: true })}
                >
                  Client review
                </SidebarLink>
                <SidebarLink
                  href={`${wsBase}/client/calendar`}
                  icon={<CalendarDays className="h-4 w-4" />}
                  active={isActivePath(`${wsBase}/client/calendar`, pathname)}
                >
                  Calendar
                </SidebarLink>
              </>
            ) : (
              <>
                <SidebarLink
                  href={wsBase}
                  icon={<LayoutDashboard className="h-4 w-4" />}
                  active={isActivePath(wsBase, pathname, { exact: true })}
                >
                  Overview
                </SidebarLink>
                <SidebarGroup
                  href={`${wsBase}/planning`}
                  icon={<ClipboardList className="h-4 w-4" />}
                  label="Planning"
                  pathname={pathname}
                  defaultOpen={planningActive}
                  active={planningActive}
                  parentTestId="sidebar-planning"
                >
                  <SidebarSubLink
                    href={`${wsBase}/planning`}
                    active={isActivePath(`${wsBase}/planning`, pathname)}
                  >
                    List
                  </SidebarSubLink>
                  <SidebarSubLink
                    href={`${wsBase}/board`}
                    active={isActivePath(`${wsBase}/board`, pathname)}
                  >
                    <Kanban className="h-3.5 w-3.5" aria-hidden="true" /> Board
                  </SidebarSubLink>
                  <SidebarSubLink
                    href={`${wsBase}/calendar`}
                    active={isActivePath(`${wsBase}/calendar`, pathname)}
                  >
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Calendar
                  </SidebarSubLink>
                </SidebarGroup>
                <SidebarLink
                  href={`${wsBase}/reviews`}
                  icon={<MessageSquare className="h-4 w-4" />}
                  active={isActivePath(`${wsBase}/reviews`, pathname)}
                >
                  Reviews
                </SidebarLink>
                <SidebarLink
                  href={`${wsBase}/design-queue`}
                  icon={<Palette className="h-4 w-4" />}
                  active={isActivePath(`${wsBase}/design-queue`, pathname)}
                >
                  Design queue
                </SidebarLink>
                <SidebarLink
                  href={`${wsBase}/library`}
                  icon={<Library className="h-4 w-4" />}
                  active={isActivePath(`${wsBase}/library`, pathname)}
                >
                  Library
                </SidebarLink>

                <div className="text-label text-fg-muted hidden px-2 pt-4 pb-1 font-semibold tracking-wide uppercase xl:block">
                  Workspace
                </div>

                <SidebarLink
                  href={`${wsBase}/channels`}
                  icon={<Share2 className="h-4 w-4" />}
                  active={isActivePath(`${wsBase}/channels`, pathname)}
                >
                  Social Channels
                </SidebarLink>
                <SidebarLink
                  href={`${wsBase}/analytics/social`}
                  icon={<BarChart3 className="h-4 w-4" />}
                  active={isActivePath(`${wsBase}/analytics/social`, pathname)}
                >
                  Social Analytics
                </SidebarLink>
                <SidebarGroup
                  href={`${wsBase}/brand-kit`}
                  icon={<Package className="h-4 w-4" />}
                  label="Brand Kit"
                  pathname={pathname}
                  defaultOpen={isActivePath(`${wsBase}/brand-kit`, pathname)}
                  active={isActivePath(`${wsBase}/brand-kit`, pathname, { exact: true })}
                  parentTestId="sidebar-brand-kit"
                >
                  <SidebarSubLink
                    href={`${wsBase}/brand-kit`}
                    active={isActivePath(`${wsBase}/brand-kit`, pathname, { exact: true })}
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Overview
                  </SidebarSubLink>
                  <NestedSidebarGroup
                    icon={<ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                    label="Identity"
                    defaultOpen={
                      isActivePath(`${wsBase}/brand-kit/logos`, pathname) ||
                      isActivePath(`${wsBase}/brand-kit/colors`, pathname) ||
                      isActivePath(`${wsBase}/brand-kit/typography`, pathname)
                    }
                    parentTestId="sidebar-brand-kit-identity"
                  >
                    <SidebarSubLink
                      href={`${wsBase}/brand-kit/logos`}
                      active={isActivePath(`${wsBase}/brand-kit/logos`, pathname)}
                    >
                      Logos
                    </SidebarSubLink>
                    <SidebarSubLink
                      href={`${wsBase}/brand-kit/colors`}
                      active={isActivePath(`${wsBase}/brand-kit/colors`, pathname)}
                    >
                      Colors
                    </SidebarSubLink>
                    <SidebarSubLink
                      href={`${wsBase}/brand-kit/typography`}
                      active={isActivePath(`${wsBase}/brand-kit/typography`, pathname)}
                    >
                      Typography
                    </SidebarSubLink>
                  </NestedSidebarGroup>
                  <NestedSidebarGroup
                    icon={<MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />}
                    label="Voice"
                    defaultOpen={
                      isActivePath(`${wsBase}/brand-kit/voice`, pathname) ||
                      isActivePath(`${wsBase}/brand-kit/pillars`, pathname) ||
                      isActivePath(`${wsBase}/brand-kit/publishing`, pathname)
                    }
                    parentTestId="sidebar-brand-kit-voice"
                  >
                    <SidebarSubLink
                      href={`${wsBase}/brand-kit/voice`}
                      active={isActivePath(`${wsBase}/brand-kit/voice`, pathname)}
                    >
                      Voice & tone
                    </SidebarSubLink>
                    <SidebarSubLink
                      href={`${wsBase}/brand-kit/pillars`}
                      active={isActivePath(`${wsBase}/brand-kit/pillars`, pathname)}
                    >
                      <Tag className="h-3.5 w-3.5" aria-hidden="true" /> Pillars
                    </SidebarSubLink>
                    <SidebarSubLink
                      href={`${wsBase}/brand-kit/publishing`}
                      active={isActivePath(`${wsBase}/brand-kit/publishing`, pathname)}
                    >
                      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" /> Publishing
                    </SidebarSubLink>
                  </NestedSidebarGroup>
                  <SidebarSubLink
                    href={`${wsBase}/brand-kit/linked`}
                    active={isActivePath(`${wsBase}/brand-kit/linked`, pathname)}
                  >
                    <LinkIcon className="h-3.5 w-3.5" aria-hidden="true" /> Linked
                  </SidebarSubLink>
                </SidebarGroup>
                <SidebarLink
                  href={`${wsBase}/brand-kit/activity`}
                  icon={<History className="h-4 w-4" />}
                  active={isActivePath(`${wsBase}/brand-kit/activity`, pathname)}
                >
                  Activity
                </SidebarLink>
                <SidebarLink
                  href={`${wsBase}/brand-kit/templates`}
                  icon={<Sparkles className="h-4 w-4" />}
                  active={isActivePath(`${wsBase}/brand-kit/templates`, pathname)}
                  testId="sidebar-brand-kit-templates"
                >
                  Templates
                </SidebarLink>
                <SidebarLink
                  href={`${wsBase}/team`}
                  icon={<Users className="h-4 w-4" />}
                  active={isActivePath(`${wsBase}/team`, pathname)}
                >
                  Team
                </SidebarLink>

                <SidebarGroup
                  href={`${wsBase}/settings`}
                  icon={<Settings className="h-4 w-4" />}
                  label="Settings"
                  pathname={pathname}
                  defaultOpen={isActivePath(`${wsBase}/settings`, pathname)}
                  parentTestId="sidebar-settings"
                >
                  <SidebarSubLink
                    href={`${wsBase}/settings#lifecycle`}
                    active={
                      pathname === `${wsBase}/settings` && (hash === "" || hash === "#lifecycle")
                    }
                  >
                    Lifecycle
                  </SidebarSubLink>
                  <SidebarSubLink
                    href={`${wsBase}/settings#lead-times`}
                    active={pathname === `${wsBase}/settings` && hash === "#lead-times"}
                  >
                    Lead times
                  </SidebarSubLink>
                  <SidebarSubLink
                    href={`${wsBase}/settings#defaults`}
                    active={pathname === `${wsBase}/settings` && hash === "#defaults"}
                  >
                    Assignment defaults
                  </SidebarSubLink>
                  <SidebarSubLink
                    href={`${wsBase}/settings#approvals`}
                    active={pathname === `${wsBase}/settings` && hash === "#approvals"}
                  >
                    Approval mode
                  </SidebarSubLink>
                  <SidebarSubLink
                    href={`${wsBase}/ai-settings`}
                    active={isActivePath(`${wsBase}/ai-settings`, pathname)}
                  >
                    <Bot className="h-3.5 w-3.5" aria-hidden="true" /> AI assistance
                  </SidebarSubLink>
                </SidebarGroup>
              </>
            )}
          </div>
        ) : (
          <>
            <SidebarLink
              href="/app/workspaces"
              icon={<Briefcase className="h-4 w-4" />}
              active={isActivePath("/app/workspaces", pathname)}
            >
              Workspaces
            </SidebarLink>
            {user.isAdmin ? (
              <>
                <div className="text-label text-fg-muted hidden px-2 pt-6 pb-2 font-semibold tracking-wide uppercase xl:block">
                  Admin
                </div>
                <SidebarLink
                  href="/app/users"
                  icon={<Users className="h-4 w-4" />}
                  active={isActivePath("/app/users", pathname)}
                >
                  User Management
                </SidebarLink>
                <SidebarGroup
                  href="/app/agency-settings"
                  icon={<Shield className="h-4 w-4" />}
                  label="Agency Settings"
                  pathname={pathname}
                  defaultOpen={isActivePath("/app/agency-settings", pathname)}
                  parentTestId="sidebar-agency-settings"
                >
                  <SidebarSubLink
                    href="/app/agency-settings"
                    active={isActivePath("/app/agency-settings", pathname, { exact: true })}
                  >
                    General
                  </SidebarSubLink>
                  <SidebarSubLink
                    href="/app/agency-settings/plan"
                    active={isActivePath("/app/agency-settings/plan", pathname)}
                  >
                    <Gauge className="h-3.5 w-3.5" aria-hidden="true" /> Plan and usage
                  </SidebarSubLink>
                  <SidebarSubLink
                    href="/app/agency-settings/ai"
                    active={isActivePath("/app/agency-settings/ai", pathname)}
                  >
                    <Bot className="h-3.5 w-3.5" aria-hidden="true" /> AI configuration
                  </SidebarSubLink>
                </SidebarGroup>
              </>
            ) : null}
            {platformAccess.canEnter ? (
              <>
                <div className="text-label text-fg-muted hidden px-2 pt-6 pb-2 font-semibold tracking-wide uppercase xl:block">
                  Platform
                </div>
                <SidebarLink
                  href="/app/platform/overview"
                  icon={<LayoutDashboard className="h-4 w-4" />}
                  active={isActivePath("/app/platform/overview", pathname)}
                >
                  Platform overview
                </SidebarLink>
                {platformAccess.canReadAgencies ? (
                  <SidebarLink
                    href="/app/platform/agencies"
                    icon={<Shield className="h-4 w-4" />}
                    active={isActivePath("/app/platform/agencies", pathname)}
                  >
                    Agencies
                  </SidebarLink>
                ) : null}
                {platformAccess.canReadSecurity ? (
                  <SidebarLink
                    href="/app/platform/security"
                    icon={<Lock className="h-4 w-4" />}
                    active={isActivePath("/app/platform/security", pathname)}
                  >
                    Security & support
                  </SidebarLink>
                ) : null}
                {platformAccess.canReadAccess ? (
                  <SidebarLink
                    href="/app/platform/access"
                    icon={<ShieldCheck className="h-4 w-4" />}
                    active={isActivePath("/app/platform/access", pathname)}
                  >
                    Platform access
                  </SidebarLink>
                ) : null}
                {platformAccess.canEnter ? (
                  <SidebarLink
                    href="/app/platform/errors"
                    icon={<AlertOctagon className="h-4 w-4" />}
                    active={isActivePath("/app/platform/errors", pathname)}
                    data-testid="sidebar-platform-errors"
                  >
                    App errors
                  </SidebarLink>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>

      {/* Bottom section: actions + meta + switcher */}
      <div className="border-border mt-auto space-y-1 border-t p-2 xl:p-4">
        {inWorkspace && currentWorkspace && !clientOnly && canCreateContent ? (
          <Link
            href={`${wsBase}/planning/new`}
            className="bg-primary hover:bg-primary-hover text-button flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] px-3 py-2 font-semibold text-white transition-colors"
            aria-label="Create content"
            title="Create content"
            data-testid="sidebar-create-content"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden xl:inline">Create content</span>
          </Link>
        ) : null}

        {/* Agency switcher lives above the workspace switcher (per
            M1.5 + Stitch design). The active agency scopes the
            workspace list the user can pick from, so the agency
            switcher is the outermost switcher. */}
        {agencySwitcher.options.length > 1 || platformAccess.canEnter ? (
          <div className="pt-1">
            <AgencySwitcher
              active={agencySwitcher.active}
              options={agencySwitcher.options}
              isPlatformAdmin={platformAccess.canEnter}
              compact
              testId="sidebar-agency-switcher-trigger"
            />
          </div>
        ) : null}

        {/* Workspace switcher lives in the sidebar bottom (per Stitch). */}
        <div className="pt-1">
          {workspaceSwitcherOptions.length === 0 ? (
            <Link
              href="/app/workspaces/new"
              className="text-body text-fg-secondary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-dashed px-3 py-2 font-semibold focus:outline-none focus-visible:ring-2"
              data-testid="sidebar-workspace-empty"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create your first workspace
            </Link>
          ) : (
            <WorkspaceSwitcher
              active={currentWorkspace ?? workspaceSwitcherOptions[0] ?? null}
              options={workspaceSwitcherOptions}
              canCreate={canCreateWorkspace}
              compact
              testId="sidebar-workspace-switcher-trigger"
            />
          )}
        </div>
      </div>
    </nav>
  );
}

// ArrowLeftRight is intentionally not used in the rendered nav itself —
// it is the canonical "switch" icon in the Stitch design and is used
// as a fallback by the WorkspaceSwitcher's chevron when no other icon
// is supplied. Importing it keeps the design-system intent discoverable.
void ArrowLeftRight;

function subscribeToHash(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function readHash() {
  return window.location.hash;
}
