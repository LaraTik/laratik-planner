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

  // Section anchors — the Stitch design has a sticky left nav with
  // 8+ settings sections. v1 ships one combined form; the section
  // list here documents the eventual split (Lifecycle / Defaults /
  // Targets / AI assistance / Archive) and provides anchor IDs so
  // the per-section nav can land on the right card group.
  const sections: { id: string; label: string }[] = [
    { id: "lifecycle", label: "Lifecycle" },
    { id: "lead-times", label: "Lead times" },
    { id: "defaults", label: "Assignment defaults" },
    { id: "approvals", label: "Approval mode" },
  ];

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

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        {/* Section nav (Stitch has 8+ entries; v1 lists the 4 we ship). */}
        <nav aria-label="Settings sections" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="space-y-1">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-body text-fg-secondary hover:bg-surface-subtle hover:text-fg-primary block rounded-[var(--radius-control)] px-3 py-2 font-semibold transition-colors"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-4">
          {canManage ? (
            <Card>
              <CardTitle className="mb-4" id="lifecycle">
                Lifecycle
              </CardTitle>
              <p className="text-body text-fg-muted mb-6 max-w-3xl">
                Standard workflow stages. Status flags like Changes Requested, Blocked, Cancelled,
                and Overdue are functional states applied to items within these stages, not distinct
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
            <div className="space-y-4">
              <Card id="lifecycle">
                <CardTitle className="mb-4">Lifecycle</CardTitle>
                <dl className="space-y-3">
                  <Setting label="Timezone" value={workspace.timezone} />
                  <Setting
                    label="Monthly target"
                    value={values.monthlyTarget ? String(values.monthlyTarget) : "Not set"}
                  />
                </dl>
              </Card>
              <Card id="lead-times">
                <CardTitle className="mb-4">Lead times</CardTitle>
                <dl className="space-y-3">
                  <Setting
                    label="Content approval"
                    value={`${values.contentApprovalLeadDays} days`}
                  />
                  <Setting
                    label="Design complete"
                    value={`${values.designCompleteLeadDays} days`}
                  />
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
              <Card id="defaults">
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
                  <Assignment
                    label="Client reviewer"
                    configured={!!values.defaultClientReviewerId}
                  />
                </div>
              </Card>
              <Card id="approvals">
                <CardTitle className="mb-4">Approval mode</CardTitle>
                <Setting label="Mode" value={humanize(values.approvalMode)} />
              </Card>
            </div>
          )}
        </div>
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
