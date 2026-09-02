import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { and, eq } from "drizzle-orm";
import { CalendarDays, Clock, CheckCircle2, UserCog, Hash, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import {
  users,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaceSettings as workspaceSettingsTable,
} from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasPlatformPermission } from "@/lib/auth/platform-access";
import { getResetAllIdeasCounts, EMPTY_RESET_ALL_COUNTS } from "@/lib/content/reset-all-ideas";
import { PageHeader } from "@/components/workspace/page-header";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { tForActive } from "@/lib/i18n/t-for-active";
import { BulkResetSection } from "./bulk-reset-section";
import { SettingsSetupChecklist } from "./_components/settings-setup-checklist";
import { SettingsHealth } from "./_components/settings-health";
import { LastSaved } from "./_components/last-saved";
import { LeadTimeDeadline } from "./_components/lead-time-deadline";
import { LifecycleForm } from "./_components/lifecycle-form";
import { LeadTimesForm } from "./_components/lead-times-form";
import { DefaultsForm } from "./_components/defaults-form";
import { ApprovalsForm } from "./_components/approvals-form";
import { currentActor } from "@/lib/auth/current-actor";

/**
 * Workspace settings overview (Settings refactor Phase A + D).
 *
 * All four editable settings sections stay on this page because
 * they share the same `workspace_settings` row. This page has
 * three layers:
 *
 *  1. Setup checklist (Phase D) — one row per configured-or-not
 *     item, with a progress count and per-row jump to the
 *     matching anchor section. Only shown when at least one
 *     item is unconfigured.
 *  2. KPI grid — 4 cards with a live count or summary per
 *     section. Each card links to an anchor section below.
 *  3. The four editable sections, each with health context and
 *     its form/read-only state.
 *
 * Plus the platform-only bulk-reset danger zone at the bottom.
 */
export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const { t } = await tForActive();
  const actor = await currentActor();
  const [canBulkReset, bulkCounts] = await Promise.all([
    actor ? hasPlatformPermission(actor, "platform.destructive.execute") : Promise.resolve(false),
    actor
      ? getResetAllIdeasCounts(workspace.id, false).catch(() => EMPTY_RESET_ALL_COUNTS)
      : Promise.resolve(EMPTY_RESET_ALL_COUNTS),
  ]);
  const [[settings], membershipRows, canManage] = await Promise.all([
    db
      .select()
      .from(workspaceSettingsTable)
      .where(eq(workspaceSettingsTable.workspaceId, workspace.id))
      .limit(1),
    db
      .select({
        userId: users.id,
        name: users.displayName,
        email: users.email,
        role: workspaceMembershipRoles.role,
      })
      .from(workspaceMemberships)
      .innerJoin(users, eq(users.id, workspaceMemberships.userId))
      .innerJoin(
        workspaceMembershipRoles,
        eq(workspaceMembershipRoles.workspaceMembershipId, workspaceMemberships.id),
      )
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspace.id),
          eq(workspaceMemberships.status, "active"),
        ),
      ),
    hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"]),
  ]);
  const values = settings ?? {
    approvalMode: "simple",
    contentApprovalLeadDays: 10,
    designCompleteLeadDays: 5,
    creativeApprovalLeadDays: 2,
    readyToPublishLeadDays: 1,
    monthlyTarget: null,
    defaultDesignerId: null,
    defaultContentReviewerId: null,
    defaultInternalCreativeReviewerId: null,
    defaultClientReviewerId: null,
  };

  const leadTotal =
    values.contentApprovalLeadDays +
    values.designCompleteLeadDays +
    values.creativeApprovalLeadDays +
    values.readyToPublishLeadDays;
  const defaultsCount = [
    values.defaultDesignerId,
    values.defaultContentReviewerId,
    values.defaultInternalCreativeReviewerId,
    values.defaultClientReviewerId,
  ].filter(Boolean).length;

  const wsBase = `/app/w/${slug}/settings`;
  const approvalModeLabel =
    values.approvalMode === "simple"
      ? t("settings.approvals.modeSimple.label")
      : t("settings.approvals.modeInternalThenClient.label");

  // Phase D — the setup checklist items. Each item carries a
  // configured flag derived from the current values. The
  // component renders nothing when all items are configured
  // (no onboarding noise for a workspace that's already set up).
  const checklistItems = [
    {
      id: "lifecycle",
      label: t("settings.items.lifecycle.label"),
      blurb:
        workspace.timezone && workspace.timezone !== "UTC"
          ? t("settings.items.lifecycle.configuredBlurb", { timezone: workspace.timezone })
          : t("settings.items.lifecycle.unconfiguredBlurb"),
      href: `${wsBase}#lifecycle`,
      configured: !!workspace.timezone && workspace.timezone !== "UTC",
    },
    {
      id: "monthly-target",
      label: t("settings.items.monthlyTarget.label"),
      blurb: values.monthlyTarget
        ? t("settings.items.monthlyTarget.configuredBlurb", { count: values.monthlyTarget })
        : t("settings.items.monthlyTarget.unconfiguredBlurb"),
      href: `${wsBase}#lifecycle`,
      configured: values.monthlyTarget !== null && values.monthlyTarget > 0,
    },
    {
      id: "lead-times",
      label: t("settings.items.leadTimes.label"),
      blurb:
        leadTotal === 18
          ? t("settings.items.leadTimes.configuredBlurb")
          : t("settings.items.leadTimes.unconfiguredBlurb", { count: leadTotal }),
      href: `${wsBase}#lead-times`,
      configured: leadTotal !== 18, // non-default = user has touched it
    },
    {
      id: "defaults",
      label: t("settings.items.defaults.label"),
      blurb:
        defaultsCount === 4
          ? t("settings.items.defaults.configuredBlurb")
          : t("settings.items.defaults.unconfiguredBlurb", { count: defaultsCount }),
      href: `${wsBase}#defaults`,
      configured: defaultsCount === 4,
    },
    {
      id: "approvals",
      label: t("settings.items.approvals.label"),
      blurb: t("settings.items.approvals.configuredBlurb", {
        mode: approvalModeLabel,
      }),
      href: `${wsBase}#approvals`,
      configured: true, // always configured (has a DB default)
    },
  ];

  return (
    <div className="space-y-6" data-testid="settings-overview">
      <PageHeader
        eyebrow={workspace.name}
        title={t("settings.title")}
        description={
          <>
            {t("settings.checklist.blurb")}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/app/w/${slug}/settings/templates`}
              data-testid="settings-browse-presets"
              className="border-border bg-surface hover:bg-surface-subtle text-body text-fg-primary inline-flex items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 font-semibold transition-colors"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t("settings.browsePresets")}
            </Link>
          </div>
        }
      />

      <SettingsSetupChecklist items={checklistItems} t={t} />

      <ul
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        data-testid="settings-kpi-grid"
      >
        <KpiCard
          href={`${wsBase}#lifecycle`}
          icon={CalendarDays}
          label={t("settings.kpi.lifecycle")}
          summary={t("settings.kpiSummary.lifecycle", { timezone: workspace.timezone })}
          badge={
            values.monthlyTarget
              ? t("settings.kpiBadge.postsPerMonth", { count: values.monthlyTarget })
              : t("settings.kpiBadge.noTarget")
          }
          testId="settings-kpi-lifecycle"
        />
        <KpiCard
          href={`${wsBase}#lead-times`}
          icon={Clock}
          label={t("settings.kpi.leadTimes")}
          summary={t("settings.kpiSummary.leadTimes", { count: leadTotal })}
          badge={
            leadTotal < 5
              ? t("settings.kpiBadge.short")
              : leadTotal > 30
                ? t("settings.kpiBadge.long")
                : t("settings.kpiBadge.balanced")
          }
          testId="settings-kpi-lead-times"
        />
        <KpiCard
          href={`${wsBase}#defaults`}
          icon={UserCog}
          label={t("settings.kpi.defaults")}
          summary={t("settings.kpiSummary.defaults", { count: defaultsCount })}
          badge={
            defaultsCount === 4 ? t("settings.kpiBadge.complete") : t("settings.kpiBadge.partial")
          }
          testId="settings-kpi-defaults"
        />
        <KpiCard
          href={`${wsBase}#approvals`}
          icon={CheckCircle2}
          label={t("settings.kpi.approvals")}
          summary={t("settings.kpiSummary.approvals", { mode: approvalModeLabel })}
          badge={
            values.approvalMode === "simple"
              ? t("settings.kpiBadge.oneStep")
              : t("settings.kpiBadge.twoSteps")
          }
          testId="settings-kpi-approvals"
        />
      </ul>

      <div className="space-y-6">
        <SettingsSection
          id="lifecycle"
          title={t("settings.lifecycle.title")}
          description={t("settings.lifecycle.description")}
        >
          <SettingsHealth
            slug={slug}
            section="lifecycle"
            metrics={{
              hasTimezone: !!workspace.timezone,
              hasMonthlyTarget: values.monthlyTarget !== null,
              monthlyTarget: values.monthlyTarget,
            }}
            t={t}
          />
          {canManage ? (
            <LifecycleForm
              slug={slug}
              timezone={workspace.timezone}
              monthlyTarget={values.monthlyTarget}
            />
          ) : (
            <ReadOnlySettings message={t("settings.lifecycle.readOnly")} />
          )}
          <LastSaved at={settings?.updatedAt ?? null} />
        </SettingsSection>

        <SettingsSection
          id="lead-times"
          title={t("settings.leadTimes.title")}
          description={t("settings.leadTimes.description")}
        >
          <SettingsHealth
            slug={slug}
            section="lead-times"
            metrics={{ total: leadTotal, ...leadTimeValues(values) }}
            t={t}
          />
          <div className="border-border bg-surface rounded-[var(--radius-card)] border p-4 sm:p-6">
            <p className="text-body text-fg-secondary mb-3 max-w-3xl">
              {t("settings.leadTimes.contextBody")}
            </p>
            <LeadTimeDeadline
              totalDays={leadTotal}
              today={new Date()}
              timezone={workspace.timezone}
            />
          </div>
          {canManage ? (
            <LeadTimesForm
              slug={slug}
              values={leadTimeValues(values)}
              approvalMode={values.approvalMode as "simple" | "internal_then_client"}
              timezone={workspace.timezone}
            />
          ) : (
            <ReadOnlySettings message={t("settings.leadTimes.readOnly")} />
          )}
          <LastSaved at={settings?.updatedAt ?? null} />
        </SettingsSection>

        <SettingsSection
          id="defaults"
          title={t("settings.defaults.title")}
          description={t("settings.defaults.description")}
        >
          <SettingsHealth
            slug={slug}
            section="defaults"
            metrics={{
              designer: !!values.defaultDesignerId,
              contentReviewer: !!values.defaultContentReviewerId,
              internalCreative: !!values.defaultInternalCreativeReviewerId,
              clientReviewer: !!values.defaultClientReviewerId,
            }}
            t={t}
          />
          {canManage ? (
            <DefaultsForm
              slug={slug}
              designers={peopleForRole(membershipRows, "designer")}
              contentReviewers={peopleForRole(membershipRows, "content_reviewer")}
              internalCreativeReviewers={peopleForRole(membershipRows, "creative_director")}
              clientReviewers={peopleForRole(membershipRows, "client_reviewer")}
              values={{
                defaultDesignerId: values.defaultDesignerId,
                defaultContentReviewerId: values.defaultContentReviewerId,
                defaultInternalCreativeReviewerId: values.defaultInternalCreativeReviewerId,
                defaultClientReviewerId: values.defaultClientReviewerId,
              }}
            />
          ) : (
            <ReadOnlySettings message={t("settings.defaults.readOnly")} />
          )}
          <LastSaved at={settings?.updatedAt ?? null} />
        </SettingsSection>

        <SettingsSection
          id="approvals"
          title={t("settings.approvals.title")}
          description={t("settings.approvals.description")}
        >
          <SettingsHealth
            slug={slug}
            section="approvals"
            metrics={{ mode: values.approvalMode as "simple" | "internal_then_client" }}
            t={t}
          />
          {canManage ? (
            <ApprovalsForm
              slug={slug}
              currentMode={values.approvalMode as "simple" | "internal_then_client"}
              leadTimes={leadTimeValues(values)}
            />
          ) : (
            <ReadOnlySettings message={t("settings.approvals.readOnly")} />
          )}
          <LastSaved at={settings?.updatedAt ?? null} />
        </SettingsSection>
      </div>

      {canBulkReset ? (
        <BulkResetSection workspaceSlug={slug} workspaceName={workspace.name} counts={bulkCounts} />
      ) : null}
    </div>
  );
}

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3" aria-labelledby={`${id}-heading`}>
      <div>
        <h2 id={`${id}-heading`} className="text-title-card text-fg-primary font-semibold">
          {title}
        </h2>
        <p className="text-body text-fg-secondary mt-1 max-w-3xl">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ReadOnlySettings({ message }: { message: string }) {
  return (
    <div className="border-border bg-surface rounded-[var(--radius-card)] border p-4">
      <p className="text-label text-fg-muted">{message}</p>
    </div>
  );
}

function leadTimeValues(values: {
  contentApprovalLeadDays: number;
  designCompleteLeadDays: number;
  creativeApprovalLeadDays: number;
  readyToPublishLeadDays: number;
}) {
  return {
    contentApprovalLeadDays: values.contentApprovalLeadDays,
    designCompleteLeadDays: values.designCompleteLeadDays,
    creativeApprovalLeadDays: values.creativeApprovalLeadDays,
    readyToPublishLeadDays: values.readyToPublishLeadDays,
  };
}

function peopleForRole(
  rows: { userId: string; name: string; email: string; role: string }[],
  role: string,
) {
  const seen = new Set<string>();
  return rows
    .filter((row) => row.role === role && !seen.has(row.userId) && seen.add(row.userId))
    .map((row) => ({ id: row.userId, label: `${row.name} · ${row.email}` }));
}

function KpiCard({
  href,
  icon: Icon,
  label,
  summary,
  badge,
  testId,
}: {
  href: string;
  icon: typeof Hash;
  label: string;
  summary: string;
  badge: string;
  testId: string;
}) {
  return (
    <li>
      <Link
        href={href}
        data-testid={testId}
        className="border-border bg-surface hover:border-primary hover:bg-surface-subtle flex items-start gap-3 rounded-[var(--radius-card)] border p-4 transition-colors"
      >
        <span
          className="bg-primary-subtle text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)]"
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-label text-fg-muted block font-semibold tracking-wide uppercase">
            {label}
          </span>
          <span className="text-section-title text-fg-primary block font-semibold">{summary}</span>
          <span className="text-label text-fg-muted mt-1 block">{badge}</span>
        </span>
      </Link>
    </li>
  );
}
