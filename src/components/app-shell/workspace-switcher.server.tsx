import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { agencyMemberships, workspaceMemberships, workspaces } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { activeAgencyId } from "@/lib/auth/policy";
import { WorkspaceSwitcher } from "./workspace-switcher";

/**
 * Server-side wrapper that loads the user's workspaces + the current
 * active workspace, then hands them to the client `<WorkspaceSwitcher>`
 * for the popover UI.
 */
export async function WorkspaceSwitcherServer() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const agencyId = await activeAgencyId();
  if (!agencyId) return null;

  const isAdmin = await isAgencyAdmin({ id: session.user.id }, agencyId);

  // The user's active workspace: first row of their memberships.
  const memberRows = await db
    .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(
      and(
        eq(workspaceMemberships.userId, session.user.id),
        eq(workspaceMemberships.status, "active"),
        eq(workspaces.status, "active"),
      ),
    )
    .orderBy(asc(workspaces.name))
    .limit(50);

  let active = memberRows[0] ?? null;
  let options = memberRows;

  // Admins see every active workspace in the agency, not just their memberships.
  if (isAdmin) {
    const all = await db
      .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
      .from(workspaces)
      .where(and(eq(workspaces.agencyId, agencyId), eq(workspaces.status, "active")))
      .orderBy(asc(workspaces.name))
      .limit(50);

    // Merge: member rows first (preserves the order the user expects),
    // then any admin-only workspaces, deduped by id.
    const seen = new Set(memberRows.map((w) => w.id));
    options = [...memberRows, ...all.filter((w) => !seen.has(w.id))];
    if (!active) active = all[0] ?? null;
  }

  // Silence unused-import warning while keeping the schema file the
  // single source of truth for related tables.
  void agencyMemberships;

  return <WorkspaceSwitcher active={active} options={options} canCreate={isAdmin} />;
}
