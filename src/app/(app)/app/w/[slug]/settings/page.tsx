import { redirect, notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Clock } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import {
  users,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaceSettings,
} from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { humanize } from "@/lib/content/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { SettingsForm } from "./settings-form";

/**
 * Workspace settings overview.
 *
 * Section navigation lives in the main sidebar as a nested
 * group (Settings → Lifecycle / Lead times / Assignment defaults /
 * Approval mode / AI assistance). This page is the settings LANDING
 * (defaults to the Lifecycle section). Each sub-section is reachable
 * via the sidebar; deep links (`#lead-times`, `#defaults`, `#approvals`)
 * scroll to the right fieldset on first render.
 *
 * Page-local navigation is intentionally absent: repeating the same
 * destinations in an overview strip consumed space without adding a
 * second useful wayfinding model.
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
  const [[settings], membershipRows, canManage] = await Promise.all([
    db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspace.id))
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

  return (
    <div className="space-y-6" data-testid="workspace-settings">
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

      <div className="space-y-4">
        {canManage ? (
          <Card data-testid="settings-form-card">
            <CardTitle className="mb-1" id="lifecycle">
              Lifecycle
            </CardTitle>
            <p className="text-body text-fg-muted mb-6 max-w-3xl">
              Standard workflow stages. Status flags like Changes Requested, Blocked, Cancelled, and
              Overdue are functional states applied to items within these stages, not distinct
              columns.
            </p>
            <SettingsForm
              slug={slug}
              values={{ ...values, timezone: workspace.timezone }}
              designers={peopleForRole(membershipRows, "designer")}
              internalReviewers={peopleForRole(membershipRows, "internal_reviewer")}
              clientReviewers={peopleForRole(membershipRows, "client_reviewer")}
            />
          </Card>
        ) : (
          <div className="space-y-4" data-testid="settings-readonly">
            <Card id="lifecycle" data-testid="settings-readonly-lifecycle">
              <CardTitle className="mb-4">Lifecycle</CardTitle>
              <dl className="space-y-3">
                <Setting label="Timezone" value={workspace.timezone} />
                <Setting
                  label="Monthly target"
                  value={values.monthlyTarget ? String(values.monthlyTarget) : "Not set"}
                />
              </dl>
            </Card>
            <Card id="lead-times" data-testid="settings-readonly-lead-times">
              <CardTitle className="mb-4">Lead times</CardTitle>
              <dl className="space-y-3">
                <Setting
                  label="Content approval"
                  value={`${values.contentApprovalLeadDays} days`}
                />
                <Setting label="Design complete" value={`${values.designCompleteLeadDays} days`} />
                <Setting
                  label="Creative approval"
                  value={`${values.creativeApprovalLeadDays} days`}
                />
                <Setting
                  label="Ready to publish"
                  value={`${values.readyToPublishLeadDays} day${values.readyToPublishLeadDays === 1 ? "" : "s"}`}
                />
              </dl>
            </Card>
            <Card id="defaults" data-testid="settings-readonly-defaults">
              <CardTitle className="mb-4">Assignment defaults</CardTitle>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Assignment label="Designer" configured={!!values.defaultDesignerId} />
                <Assignment
                  label="Content reviewer"
                  configured={!!values.defaultContentReviewerId}
                />
                <Assignment
                  label="Internal creative reviewer"
                  configured={!!values.defaultInternalCreativeReviewerId}
                />
                <Assignment label="Client reviewer" configured={!!values.defaultClientReviewerId} />
              </div>
            </Card>
            <Card id="approvals" data-testid="settings-readonly-approvals">
              <CardTitle className="mb-4">Approval mode</CardTitle>
              <Setting label="Mode" value={humanize(values.approvalMode)} />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
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
function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <dt className="text-body text-fg-secondary">{label}</dt>
      <dd className="text-body text-fg-primary font-semibold capitalize">{value}</dd>
    </div>
  );
}
function Assignment({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="bg-surface-subtle rounded-[var(--radius-control)] p-3">
      <p className="text-label text-fg-muted">{label}</p>
      <Badge className="mt-2" variant={configured ? "success" : "warning"}>
        {configured ? "Configured" : "Not configured"}
      </Badge>
    </div>
  );
}
