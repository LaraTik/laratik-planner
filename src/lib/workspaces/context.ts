import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceMemberships, workspaces } from "@/lib/db/schema";
import {
  firstAgencyForBootstrap,
  canAccessClientWorkspace,
  canAccessInternalWorkspace,
  isAgencyAdmin,
  type Actor,
} from "@/lib/auth/policy";

async function findWorkspaceBySlug(slug: string) {
  const agencyId = await firstAgencyForBootstrap();
  if (!agencyId) return null;
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.agencyId, agencyId), eq(workspaces.slug, slug)))
    .limit(1);
  return workspace ?? null;
}

export async function getAccessibleWorkspace(actor: Actor, slug: string) {
  const workspace = await findWorkspaceBySlug(slug);
  if (!workspace || !(await canAccessInternalWorkspace(actor, workspace.id))) return null;
  return workspace;
}

export async function getClientWorkspace(actor: Actor, slug: string) {
  const workspace = await findWorkspaceBySlug(slug);
  if (!workspace || !(await canAccessClientWorkspace(actor, workspace.id))) return null;
  return workspace;
}

/**
 * Every workspace in the current agency the actor can switch to.
 *
 * Members see their own active memberships. Agency admins additionally
 * see every other active workspace in the agency, with member rows
 * first so the order matches what the user expects. Used by the
 * workspace switcher in the sidebar.
 */
export type SwitcherWorkspace = { id: string; name: string; slug: string };

export async function listSwitcherWorkspaces(
  actor: Actor,
): Promise<{ options: SwitcherWorkspace[]; isAdmin: boolean }> {
  const agencyId = await firstAgencyForBootstrap();
  if (!agencyId) return { options: [], isAdmin: false };
  const isAdmin = await isAgencyAdmin(actor, agencyId);

  const memberRows = await db
    .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(
      and(
        eq(workspaceMemberships.userId, actor.id),
        eq(workspaceMemberships.status, "active"),
        eq(workspaces.status, "active"),
      ),
    )
    .orderBy(asc(workspaces.name))
    .limit(50);

  if (!isAdmin) {
    return { options: memberRows, isAdmin: false };
  }

  const all = await db
    .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
    .from(workspaces)
    .where(and(eq(workspaces.agencyId, agencyId), eq(workspaces.status, "active")))
    .orderBy(asc(workspaces.name))
    .limit(50);

  const seen = new Set(memberRows.map((w) => w.id));
  return {
    options: [...memberRows, ...all.filter((w) => !seen.has(w.id))],
    isAdmin: true,
  };
}
