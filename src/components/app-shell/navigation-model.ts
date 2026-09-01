import {
  AlertOctagon,
  BarChart3,
  BookOpen,
  Bot,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Clock,
  History,
  Home,
  Image as ImageIcon,
  Kanban,
  LayoutDashboard,
  Library,
  Link as LinkIcon,
  Lock,
  MessageCircle,
  MessageSquare,
  Package,
  Palette,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  Sparkles,
  Tag,
  Users,
  Gauge,
} from "lucide-react";
import type { PlatformNavigationAccess } from "@/lib/auth/platform-navigation-access";

/**
 * Sidebar navigation model — typed, config-driven.
 *
 * The previous Sidebar had ~250 lines of hand-written JSX. Every
 * route, group header, icon, and active predicate was spelled out
 * inline. This module moves that structure into a single,
 * inspectable data model so:
 *
 *  1. The full navigation tree is one place reviewers can scan.
 *  2. Adding a new destination is one entry, not a JSX surgery.
 *  3. Role / permission filters become data-driven.
 *  4. The CLI documentation (nav-map doc) is auto-generated.
 *
 * Each entry is intentionally a plain object — the React renderer
 * (sidebar-group primitives) stays in the .tsx files. The model
 * is pure data so it can be unit-tested without DOM.
 */

export type IconComponent = typeof LayoutDashboard;

export type SidebarLinkSpec = {
  kind: "link";
  /** Stable key — used as React key, the test-id suffix, and the labels-map lookup. */
  key: string;
  /** Resolved href (workspace links are prefixed by the caller). */
  href: string;
  /** English fallback label — used when the catalog lookup misses the active locale. */
  label: string;
  /**
   * Catalog key (e.g. `sidebar.workspaceOverview`). The Sidebar
   * component resolves this through the per-request labels map;
   * the English `label` is the fallback for missing keys.
   */
  labelKey: string;
  /** lucide-react icon component (rendered with h-4 w-4). */
  icon: IconComponent;
  /** Optional badge count (actionable only). */
  badge?: number | undefined;
  /** Test id — auto-derived from key when omitted. */
  testId?: string | undefined;
};

export type SidebarExpandableGroupSpec = {
  kind: "expandable";
  key: string;
  label: string;
  labelKey: string;
  href: string;
  icon: IconComponent;
  /** Active when any of these prefixes matches the current pathname. */
  activePrefixes: string[];
  children: SidebarItemSpec[];
  testId?: string;
};

export type SidebarGroupSpec = {
  kind: "group";
  key: string;
  label: string;
  labelKey: string;
  /** Section heading style (uppercase / muted). */
  heading: boolean;
  /** Group items — links, nested groups, or expandable parents. */
  items: SidebarItemSpec[];
};

export type SidebarItemSpec =
  SidebarLinkSpec | SidebarExpandableGroupSpec | SidebarGroupSpec | SidebarNestedItemSpec;

export type SidebarNestedItemSpec = {
  kind: "nested-group";
  key: string;
  label: string;
  labelKey: string;
  icon: IconComponent;
  items: SidebarLinkSpec[];
};

/**
 * Workspace navigation — grouped by workflow, not by historical
 * data model. The grouping matches the §1.B guidance in the
 * StudioFlow /ui-ux-pro-max spec.
 *
 * Groups: Overview (top), Content, Performance, Brand, Manage.
 *
 * Routes and labels are preserved from the previous Sidebar. The
 * structure is reorganised; the destination URLs are unchanged so
 * deep links keep working.
 */
export function buildWorkspaceNavigation(input: {
  wsBase: string;
  /** Badges — pre-computed by the server; absent means 0 / hidden. */
  badges: { approvals?: number; designQueue?: number };
  /** Whether the actor can create content. */
  canCreateContent: boolean;
  /** Whether the actor sees management items (admin/manager). */
  canManage: boolean;
}): { top: SidebarLinkSpec[]; groups: SidebarGroupSpec[]; createContentHref: string | null } {
  const { wsBase, badges, canManage } = input;

  const top: SidebarLinkSpec[] = [
    {
      kind: "link",
      key: "overview",
      href: wsBase,
      label: "Overview",
      labelKey: "sidebar.workspaceOverview",
      icon: LayoutDashboard,
    },
  ];

  const groups: SidebarGroupSpec[] = [
    {
      kind: "group",
      key: "content",
      label: "Content",
      labelKey: "sidebar.workspaceContent",
      heading: true,
      items: [
        {
          kind: "expandable",
          key: "planning",
          label: "Planning",
          labelKey: "sidebar.planning",
          href: `${wsBase}/planning`,
          icon: ClipboardList,
          activePrefixes: [`${wsBase}/planning`, `${wsBase}/board`, `${wsBase}/calendar`],
          testId: "sidebar-planning",
          children: [
            {
              kind: "link",
              key: "planning-list",
              href: `${wsBase}/planning`,
              label: "List",
              labelKey: "sidebar.planningList",
              icon: ClipboardList,
            },
            {
              kind: "link",
              key: "planning-board",
              href: `${wsBase}/board`,
              label: "Board",
              labelKey: "sidebar.planningBoard",
              icon: Kanban,
            },
            {
              kind: "link",
              key: "planning-calendar",
              href: `${wsBase}/calendar`,
              label: "Calendar",
              labelKey: "sidebar.planningCalendar",
              icon: CalendarDays,
            },
          ],
        },
        {
          kind: "link",
          key: "approvals",
          href: `${wsBase}/reviews`,
          label: "Approvals",
          labelKey: "sidebar.approvals",
          icon: MessageSquare,
          badge: badges.approvals,
        },
        {
          kind: "link",
          key: "design-queue",
          href: `${wsBase}/design-queue`,
          label: "Design queue",
          labelKey: "sidebar.designQueue",
          icon: Palette,
          badge: badges.designQueue,
        },
        {
          kind: "link",
          key: "library",
          href: `${wsBase}/library`,
          label: "Library",
          labelKey: "sidebar.library",
          icon: Library,
        },
      ],
    },
    {
      kind: "group",
      key: "performance",
      label: "Performance",
      labelKey: "sidebar.performance",
      heading: true,
      items: [
        {
          kind: "link",
          key: "channels",
          href: `${wsBase}/channels`,
          label: "Channels",
          labelKey: "sidebar.channels",
          icon: Share2,
        },
        {
          kind: "link",
          key: "analytics",
          href: `${wsBase}/analytics/social`,
          label: "Analytics",
          labelKey: "sidebar.analytics",
          icon: BarChart3,
        },
      ],
    },
    {
      kind: "group",
      key: "brand",
      label: "Brand",
      labelKey: "sidebar.brand",
      heading: true,
      items: [
        {
          kind: "expandable",
          key: "brand-kit",
          label: "Brand kit",
          labelKey: "sidebar.brandKit",
          href: `${wsBase}/brand-kit`,
          icon: Package,
          activePrefixes: [`${wsBase}/brand-kit`],
          testId: "sidebar-brand-kit",
          children: [
            {
              kind: "link",
              key: "brand-kit-overview",
              href: `${wsBase}/brand-kit`,
              label: "Overview",
              labelKey: "sidebar.workspaceOverview",
              icon: Sparkles,
            },
            {
              kind: "nested-group",
              key: "brand-kit-identity",
              label: "Identity",
              labelKey: "sidebar.brandIdentity",
              icon: ImageIcon,
              items: [
                {
                  kind: "link",
                  key: "brand-kit-logos",
                  href: `${wsBase}/brand-kit/logos`,
                  label: "Logos",
                  labelKey: "sidebar.brandLogos",
                  icon: ImageIcon,
                },
                {
                  kind: "link",
                  key: "brand-kit-colors",
                  href: `${wsBase}/brand-kit/colors`,
                  label: "Colors",
                  labelKey: "sidebar.brandColors",
                  icon: Palette,
                },
                {
                  kind: "link",
                  key: "brand-kit-typography",
                  href: `${wsBase}/brand-kit/typography`,
                  label: "Typography",
                  labelKey: "sidebar.brandTypography",
                  icon: BookOpen,
                },
              ],
            },
            {
              kind: "nested-group",
              key: "brand-kit-voice",
              label: "Voice",
              labelKey: "sidebar.brandVoice",
              icon: MessageCircle,
              items: [
                {
                  kind: "link",
                  key: "brand-kit-voice",
                  href: `${wsBase}/brand-kit/voice`,
                  label: "Voice & tone",
                  labelKey: "sidebar.brandVoiceTone",
                  icon: MessageCircle,
                },
                {
                  kind: "link",
                  key: "brand-kit-pillars",
                  href: `${wsBase}/brand-kit/pillars`,
                  label: "Pillars",
                  labelKey: "sidebar.brandPillars",
                  icon: Tag,
                },
                {
                  kind: "link",
                  key: "brand-kit-publishing",
                  href: `${wsBase}/brand-kit/publishing`,
                  label: "Publishing",
                  labelKey: "sidebar.brandPublishing",
                  icon: BookOpen,
                },
              ],
            },
            {
              kind: "link",
              key: "brand-kit-linked",
              href: `${wsBase}/brand-kit/linked`,
              label: "Linked",
              labelKey: "sidebar.brandLinked",
              icon: LinkIcon,
            },
          ],
        },
        {
          kind: "link",
          key: "templates",
          href: `${wsBase}/brand-kit/templates`,
          label: "Templates",
          labelKey: "sidebar.brandTemplates",
          icon: Sparkles,
          testId: "sidebar-brand-kit-templates",
        },
      ],
    },
  ];

  if (canManage) {
    groups.push({
      kind: "group",
      key: "manage",
      label: "Manage",
      labelKey: "sidebar.manage",
      heading: true,
      items: [
        {
          kind: "link",
          key: "activity",
          href: `${wsBase}/brand-kit/activity`,
          label: "Activity",
          labelKey: "sidebar.activity",
          icon: History,
        },
        {
          kind: "link",
          key: "team",
          href: `${wsBase}/team`,
          label: "Team",
          labelKey: "sidebar.team",
          icon: Users,
        },
        {
          kind: "expandable",
          key: "settings",
          label: "Settings",
          labelKey: "sidebar.settings",
          href: `${wsBase}/settings`,
          icon: Settings,
          activePrefixes: [`${wsBase}/settings`, `${wsBase}/ai-settings`],
          testId: "sidebar-settings",
          children: [
            {
              kind: "link",
              key: "settings-lifecycle",
              href: `${wsBase}/settings#lifecycle`,
              label: "Lifecycle",
              labelKey: "sidebar.settingsLifecycle",
              icon: History,
            },
            {
              kind: "link",
              key: "settings-lead-times",
              href: `${wsBase}/settings#lead-times`,
              label: "Lead times",
              labelKey: "sidebar.settingsLeadTimes",
              icon: Clock,
            },
            {
              kind: "link",
              key: "settings-defaults",
              href: `${wsBase}/settings#defaults`,
              label: "Assignment defaults",
              labelKey: "sidebar.settingsAssignmentDefaults",
              icon: Users,
            },
            {
              kind: "link",
              key: "settings-approvals",
              href: `${wsBase}/settings#approvals`,
              label: "Approval mode",
              labelKey: "sidebar.settingsApprovalMode",
              icon: MessageSquare,
            },
            {
              kind: "link",
              key: "settings-ai",
              href: `${wsBase}/ai-settings`,
              label: "AI assistance",
              labelKey: "sidebar.settingsAiAssistance",
              icon: Bot,
            },
            {
              kind: "link",
              key: "settings-templates",
              href: `${wsBase}/settings/templates`,
              label: "Presets",
              labelKey: "sidebar.settingsPresets",
              icon: Sparkles,
            },
          ],
        },
      ],
    });
  }

  return {
    top,
    groups,
    createContentHref: input.canCreateContent ? `${wsBase}/planning/new` : null,
  };
}

/**
 * Agency (global) navigation — top-level destinations the user
 * sees when NOT inside /app/w/[slug]/*. Includes the My Work
 * cross-workspace command center, Workspaces list, admin items
 * (admin only), and platform items (platform admin only).
 */
export type AgencyNavigationInput = {
  isAdmin: boolean;
  platformAccess: PlatformNavigationAccess;
  unreadAppErrors?: number;
};

export function buildAgencyNavigation(input: AgencyNavigationInput): {
  top: SidebarLinkSpec[];
  groups: SidebarGroupSpec[];
} {
  const { isAdmin, platformAccess, unreadAppErrors } = input;

  const top: SidebarLinkSpec[] = [
    {
      kind: "link",
      key: "my-work",
      href: "/app",
      label: "My work",
      labelKey: "sidebar.myWork",
      icon: Home,
    },
  ];

  const groups: SidebarGroupSpec[] = [
    {
      kind: "group",
      key: "agency",
      label: "Agency",
      labelKey: "sidebar.agencyGroup",
      heading: true,
      items: [
        {
          kind: "link",
          key: "workspaces",
          href: "/app/workspaces",
          label: "Workspaces",
          labelKey: "sidebar.agencyWorkspaces",
          icon: Briefcase,
        },
      ],
    },
  ];

  if (isAdmin) {
    groups.push({
      kind: "group",
      key: "admin",
      label: "Admin",
      labelKey: "sidebar.adminGroup",
      heading: true,
      items: [
        {
          kind: "link",
          key: "users",
          href: "/app/users",
          label: "User management",
          labelKey: "sidebar.users",
          icon: Users,
        },
        {
          kind: "expandable",
          key: "agency-settings",
          label: "Agency settings",
          labelKey: "sidebar.agencySettings",
          href: "/app/agency-settings",
          icon: Shield,
          activePrefixes: ["/app/agency-settings"],
          testId: "sidebar-agency-settings",
          children: [
            {
              kind: "link",
              key: "agency-settings-general",
              href: "/app/agency-settings",
              label: "General",
              labelKey: "sidebar.settingsGeneral",
              icon: Settings,
            },
            {
              kind: "link",
              key: "agency-settings-plan",
              href: "/app/agency-settings/plan",
              label: "Plan and usage",
              labelKey: "sidebar.settingsPlan",
              icon: Gauge,
            },
            {
              kind: "link",
              key: "agency-settings-ai",
              href: "/app/agency-settings/ai",
              label: "AI configuration",
              labelKey: "sidebar.settingsAiConfiguration",
              icon: Bot,
            },
          ],
        },
      ],
    });
  }

  if (platformAccess.canEnter) {
    const platformItems: SidebarLinkSpec[] = [
      {
        kind: "link",
        key: "platform-overview",
        href: "/app/platform/overview",
        label: "Platform overview",
        labelKey: "sidebar.platformOverview",
        icon: LayoutDashboard,
      },
    ];
    if (platformAccess.canReadAgencies) {
      platformItems.push({
        kind: "link",
        key: "platform-agencies",
        href: "/app/platform/agencies",
        label: "Agencies",
        labelKey: "sidebar.platformAgencies",
        icon: Shield,
      });
    }
    if (platformAccess.canReadSecurity) {
      platformItems.push({
        kind: "link",
        key: "platform-security",
        href: "/app/platform/security",
        label: "Security & support",
        labelKey: "sidebar.platformSecurity",
        icon: Lock,
      });
    }
    if (platformAccess.canReadAccess) {
      platformItems.push({
        kind: "link",
        key: "platform-access",
        href: "/app/platform/access",
        label: "Platform access",
        labelKey: "sidebar.platformAccess",
        icon: ShieldCheck,
      });
    }
    platformItems.push({
      kind: "link",
      key: "platform-errors",
      href: "/app/platform/errors",
      label: "App errors",
      labelKey: "sidebar.appErrors",
      icon: AlertOctagon,
      badge: unreadAppErrors,
      testId: "sidebar-platform-errors",
    });

    groups.push({
      kind: "group",
      key: "platform",
      label: "Platform",
      labelKey: "sidebar.platformGroup",
      heading: true,
      items: platformItems,
    });
  }

  return { top, groups };
}

/**
 * Client-reviewer navigation — the minimal sidebar shown when the
 * actor's only access to the workspace is as a `client_reviewer`.
 * The studio (Planning, Brand Kit, Channels, etc.) is hidden
 * because the client surface lives at /app/w/[slug]/client/*.
 */
export function buildClientReviewerNavigation(input: { wsBase: string }): {
  top: SidebarLinkSpec[];
} {
  const { wsBase } = input;
  return {
    top: [
      {
        kind: "link",
        key: "client-review",
        href: `${wsBase}/client`,
        label: "Client review",
        labelKey: "sidebar.clientReview",
        icon: MessageSquare,
      },
      {
        kind: "link",
        key: "client-calendar",
        href: `${wsBase}/client/calendar`,
        label: "Calendar",
        labelKey: "sidebar.planningCalendar",
        icon: CalendarDays,
      },
    ],
  };
}
