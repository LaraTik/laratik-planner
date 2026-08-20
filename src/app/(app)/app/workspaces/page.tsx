import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { activeAgencyId, isAgencyAdmin } from "@/lib/auth/policy";
import { workspaces, workspaceMemberships, workspaceMembershipRoles } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListCard, ListItem } from "@/components/workspace/list-item";
import { PageHeader } from "@/components/workspace/page-header";
import { IconTile } from "@/components/workspace/icon-button";
import { Plus, Folder } from "lucide-react";

/**
 * Workspaces index — list of all workspaces in the current agency.
 * For non-admins: only shows workspaces the user is a member of.
 * For admins: shows all active workspaces.
 */
export const metadata = { title: "Workspaces" };

export default async function WorkspacesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const agencyId = await activeAgencyId();
  if (!agencyId) return null;
  const isAdmin = await isAgencyAdmin({ id: session.user.id }, agencyId);

  const rows = isAdmin
    ? await db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
          status: workspaces.status,
          memberCount: sql<number>`(
            SELECT count(*)::int FROM ${workspaceMemberships}
            WHERE ${workspaceMemberships.workspaceId} = ${workspaces.id}
              AND ${workspaceMemberships.status} = 'active'
          )`,
        })
        .from(workspaces)
        .where(and(eq(workspaces.agencyId, agencyId), isNull(workspaces.archivedAt)))
    : await db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
          status: workspaces.status,
          memberCount: sql<number>`(
            SELECT count(*)::int FROM ${workspaceMemberships}
            WHERE ${workspaceMemberships.workspaceId} = ${workspaces.id}
              AND ${workspaceMemberships.status} = 'active'
          )`,
        })
        .from(workspaces)
        .innerJoin(
          workspaceMemberships,
          and(
            eq(workspaceMemberships.workspaceId, workspaces.id),
            eq(workspaceMemberships.userId, session.user.id),
            eq(workspaceMemberships.status, "active"),
          ),
        )
        .where(and(eq(workspaces.agencyId, agencyId), isNull(workspaces.archivedAt)));

  // quiet unused
  void workspaceMembershipRoles;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workspaces"
        description={
          isAdmin
            ? "All workspaces in this agency. Create a new one to onboard a client brand."
            : "Workspaces you're a member of."
        }
        action={
          isAdmin ? (
            <Button asChild>
              <Link href="/app/workspaces/new">
                <Plus className="h-4 w-4" aria-hidden="true" />
                New workspace
              </Link>
            </Button>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Folder className="h-8 w-8" aria-hidden="true" />}
          title="No workspaces yet"
          description={
            isAdmin
              ? "Create the first workspace to start planning content for a client brand."
              : "Ask an admin to add you to a workspace."
          }
          action={
            isAdmin ? (
              <Button asChild>
                <Link href="/app/workspaces/new">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  New workspace
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <ListCard>
          {rows.map((ws) => (
            <ListItem
              key={ws.id}
              href={`/app/w/${ws.slug}`}
              leading={
                <IconTile tone="primary" aria-hidden="true">
                  {ws.name.charAt(0).toUpperCase()}
                </IconTile>
              }
              title={ws.name}
              meta={`${ws.slug}.planner.laratik.com`}
              trailing={
                <span className="text-label text-fg-muted">
                  {ws.memberCount} member{ws.memberCount === 1 ? "" : "s"}
                </span>
              }
            />
          ))}
        </ListCard>
      )}
    </div>
  );
}
