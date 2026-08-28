import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Clock } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { workspaceSettings as workspaceSettingsTable } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { humanize } from "@/lib/content/status";
import { hasPlatformPermission } from "@/lib/auth/platform-access";
import { getResetAllIdeasCounts, EMPTY_RESET_ALL_COUNTS } from "@/lib/content/reset-all-ideas";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/workspace/page-header";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { BulkResetSection } from "./bulk-reset-section";
import { currentActor } from "@/lib/auth/current-actor";

/**
 * Workspace settings overview (Settings refactor Phase A).
 *
 * Was a single page with 5 anchor fieldsets (Lifecycle / Lead
 * times / Defaults / Approvals / AI assistance) all sharing
 * the same `workspace_settings` row. Now the per-section pages
 * own their own form + Health card + AI state. This page is the
 * settings LANDING — a KPI grid that links to each per-section
 * page, plus the platform-only bulk-reset danger zone.
 *
 * The user explicitly asked to split the single page into
 * per-section pages "to properly define" each section (deviation
 * from master prompt §17 "data is one row — keep on one
 * page"). The DB schema is unchanged; the actions do partial
 * UPDATEs so a save on one section doesn't clobber a concurrent
 * edit on another.
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
  const actor = await currentActor();
  const [canBulkReset, bulkCounts] = await Promise.all([
    actor ? hasPlatformPermission(actor, "platform.destructive.execute") : Promise.resolve(false),
    actor
      ? getResetAllIdeasCounts(workspace.id, false).catch(() => EMPTY_RESET_ALL_COUNTS)
      : Promise.resolve(EMPTY_RESET_ALL_COUNTS),
  ]);
  const [[settings], canManage] = await Promise.all([
    db
      .select()
      .from(workspaceSettingsTable)
      .where(eq(workspaceSettingsTable.workspaceId, workspace.id))
      .limit(1),
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

  return (
    <div className="space-y-6" data-testid="settings-overview">
      <PageHeader
        eyebrow={workspace.name}
        title="Workspace settings"
        description={
          <>
            Defaults reduce setup work while keeping every idea editable.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
      />

      <ul
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        data-testid="settings-kpi-grid"
      >
        <KpiCard
          href={`${wsBase}/lifecycle`}
          icon="🗓"
          label="Lifecycle"
          summary={`Timezone: ${workspace.timezone}`}
          badge={values.monthlyTarget ? `${values.monthlyTarget} posts / month` : "No target"}
          testId="settings-kpi-lifecycle"
        />
        <KpiCard
          href={`${wsBase}/lead-times`}
          icon="⏱"
          label="Lead times"
          summary={`${leadTotal} business days end-to-end`}
          badge={leadTotal < 5 ? "Short" : leadTotal > 30 ? "Long" : "Balanced"}
          testId="settings-kpi-lead-times"
        />
        <KpiCard
          href={`${wsBase}/defaults`}
          icon="👤"
          label="Default assignments"
          summary={`${defaultsCount} of 4 roles configured`}
          badge={defaultsCount === 4 ? "Complete" : "Partial"}
          testId="settings-kpi-defaults"
        />
        <KpiCard
          href={`${wsBase}/approvals`}
          icon="✓"
          label="Approval mode"
          summary={humanize(values.approvalMode)}
          badge={values.approvalMode === "simple" ? "1 step" : "2 steps"}
          testId="settings-kpi-approvals"
        />
      </ul>

      <section
        className="border-border bg-surface rounded-[var(--radius-card)] border p-4 sm:p-6"
        data-testid="settings-readonly"
      >
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-section-title text-fg-primary font-semibold">
            Current configuration
          </h2>
          {canManage ? (
            <Badge variant="info">Manager view — open a section to edit</Badge>
          ) : (
            <Badge variant="warning">Read-only</Badge>
          )}
        </header>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Setting label="Timezone" value={workspace.timezone} />
          <Setting
            label="Monthly target"
            value={values.monthlyTarget ? `${values.monthlyTarget} posts / month` : "Not set"}
          />
          <Setting
            label="Lead time total"
            value={`${leadTotal} business days`}
            href={`${wsBase}/lead-times`}
          />
          <Setting
            label="Approval mode"
            value={humanize(values.approvalMode)}
            href={`${wsBase}/approvals`}
          />
          <Setting
            label="Default assignees"
            value={`${defaultsCount} of 4 configured`}
            href={`${wsBase}/defaults`}
          />
        </dl>
      </section>

      {canBulkReset ? (
        <BulkResetSection workspaceSlug={slug} workspaceName={workspace.name} counts={bulkCounts} />
      ) : null}
    </div>
  );
}

function KpiCard({
  href,
  icon,
  label,
  summary,
  badge,
  testId,
}: {
  href: string;
  icon: string;
  label: string;
  summary: string;
  badge: string;
  testId: string;
}) {
  return (
    <li>
      <a
        href={href}
        data-testid={testId}
        className="border-border bg-surface hover:border-primary hover:bg-surface-subtle flex items-start gap-3 rounded-[var(--radius-card)] border p-4 transition-colors"
      >
        <span
          className="bg-primary-subtle text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-xl"
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-label text-fg-muted block font-semibold tracking-wide uppercase">
            {label}
          </span>
          <span className="text-section-title text-fg-primary block font-semibold">{summary}</span>
          <span className="text-label text-fg-muted mt-1 block">{badge}</span>
        </span>
      </a>
    </li>
  );
}

function Setting({ label, value, href }: { label: string; value: string; href?: string }) {
  const inner = (
    <>
      <dt className="text-body text-fg-secondary">{label}</dt>
      <dd className="text-body text-fg-primary font-semibold">{value}</dd>
    </>
  );
  return (
    <div className="bg-surface-subtle flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] p-3">
      {href ? (
        <a href={href} className="flex w-full flex-wrap items-center justify-between gap-3">
          {inner}
        </a>
      ) : (
        inner
      )}
    </div>
  );
}
