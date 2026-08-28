import { redirect, notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { UserCog } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import {
  users,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaceSettings as workspaceSettingsTable,
} from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { PageHeader } from "@/components/workspace/page-header";
import { SectionCard } from "@/components/workspace/section-card";
import { SettingsBackLink } from "../_components/settings-back-link";
import { SettingsHealth } from "../_components/settings-health";
import { DefaultsForm } from "../_components/defaults-form";

/**
 * /app/w/[slug]/settings/defaults — the Default assignments
 * section page (Settings refactor Phase A).
 *
 * Pre-fills the matching role on every new content item;
 * per-item overrides always win. The dropdown options are
 * filtered by workspace role so a planner can't accidentally
 * pick a viewer as the default designer.
 */
export default async function SettingsDefaultsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const canManage = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
  ]);
  const [[settings], membershipRows] = await Promise.all([
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
  ]);

  return (
    <div className="space-y-6">
      <SettingsBackLink slug={slug} />
      <PageHeader
        eyebrow="Settings"
        title={
          <span className="inline-flex items-center gap-2">
            <UserCog className="text-fg-muted h-6 w-6" aria-hidden="true" />
            Default assignments
          </span>
        }
        description="The four people pre-filled on every new content item. Per-item overrides always win — the default is a shortcut, not a rule."
      />
      <SettingsHealth
        slug={slug}
        section="defaults"
        metrics={{
          designer: !!settings?.defaultDesignerId,
          contentReviewer: !!settings?.defaultContentReviewerId,
          internalCreative: !!settings?.defaultInternalCreativeReviewerId,
          clientReviewer: !!settings?.defaultClientReviewerId,
        }}
      />
      <SectionCard
        id="defaults"
        title="Default assignees"
        fullWidth
        aria-label="Default assignees"
        data-testid="settings-section-defaults"
      >
        {canManage ? (
          <DefaultsForm
            slug={slug}
            designers={peopleForRole(membershipRows, "designer")}
            contentReviewers={peopleForRole(membershipRows, "content_reviewer")}
            internalCreativeReviewers={peopleForRole(membershipRows, "creative_director")}
            clientReviewers={peopleForRole(membershipRows, "client_reviewer")}
            values={{
              defaultDesignerId: settings?.defaultDesignerId ?? null,
              defaultContentReviewerId: settings?.defaultContentReviewerId ?? null,
              defaultInternalCreativeReviewerId:
                settings?.defaultInternalCreativeReviewerId ?? null,
              defaultClientReviewerId: settings?.defaultClientReviewerId ?? null,
            }}
          />
        ) : (
          <p className="text-label text-fg-muted">
            Read-only. Workspace manager access is required to edit these settings.
          </p>
        )}
      </SectionCard>
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
