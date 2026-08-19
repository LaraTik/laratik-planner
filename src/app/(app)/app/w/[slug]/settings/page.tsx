import { redirect, notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import {
  users,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaceSettings,
} from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { ScreenHeading } from "@/components/workspace/screen-heading";
import { Badge } from "@/components/ui/badge";
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
  return (
    <div className="space-y-6">
      <ScreenHeading
        eyebrow={workspace.name}
        title="Workspace settings"
        description="Defaults reduce setup work while keeping every idea editable."
      />
      {canManage ? (
        <section className="border-border bg-surface rounded-[var(--radius-card)] border p-5">
          <SettingsForm
            slug={slug}
            values={{ ...values, timezone: workspace.timezone }}
            designers={peopleForRole(membershipRows, "designer")}
            internalReviewers={peopleForRole(membershipRows, "internal_reviewer")}
            clientReviewers={peopleForRole(membershipRows, "client_reviewer")}
          />
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="border-border bg-surface rounded-[var(--radius-card)] border p-5">
            <h2 className="text-title-card font-semibold">Planning defaults</h2>
            <dl className="mt-4 space-y-3">
              <Setting label="Timezone" value={workspace.timezone} />
              <Setting
                label="Monthly target"
                value={values.monthlyTarget ? String(values.monthlyTarget) : "Not set"}
              />
              <Setting label="Approval mode" value={values.approvalMode.replace(/_/g, " ")} />
            </dl>
          </section>
          <section className="border-border bg-surface rounded-[var(--radius-card)] border p-5">
            <h2 className="text-title-card font-semibold">Lead times</h2>
            <dl className="mt-4 space-y-3">
              <Setting label="Content approval" value={`${values.contentApprovalLeadDays} days`} />
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
          </section>
          <section className="border-border bg-surface rounded-[var(--radius-card)] border p-5 lg:col-span-2">
            <h2 className="text-title-card font-semibold">Default assignments</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Assignment label="Designer" configured={!!values.defaultDesignerId} />
              <Assignment label="Content reviewer" configured={!!values.defaultContentReviewerId} />
              <Assignment
                label="Internal creative reviewer"
                configured={!!values.defaultInternalCreativeReviewerId}
              />
              <Assignment label="Client reviewer" configured={!!values.defaultClientReviewerId} />
            </div>
          </section>
        </div>
      )}
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
    <div className="flex items-center justify-between gap-3">
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
