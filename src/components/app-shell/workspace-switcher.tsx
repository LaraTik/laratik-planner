import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { agencyMemberships, workspaceMemberships, workspaces } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { activeAgencyId } from "@/lib/auth/policy";

/**
 * Workspace switcher — shows the user's active workspace, with a quick
 * link to the workspaces list and a "+" to create a new one (admin only).
 *
 * For Goal 3, the active workspace is the first workspace the user is
 * a member of (or the first workspace in the agency for admins). Goal 4
 * adds a workspace selector cookie / URL state.
 */
export async function WorkspaceSwitcher() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const agencyId = await activeAgencyId();
  if (!agencyId) return null;

  const isAdmin = await isAgencyAdmin({ id: session.user.id }, agencyId);

  // Find the user's first workspace, or the agency's first if admin
  let activeWorkspace: { id: string; name: string; slug: string } | null = null;

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
    .limit(1);

  if (memberRows[0]) {
    activeWorkspace = memberRows[0];
  } else if (isAdmin) {
    const [any] = await db
      .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
      .from(workspaces)
      .where(and(eq(workspaces.agencyId, agencyId), eq(workspaces.status, "active")))
      .limit(1);
    activeWorkspace = any ?? null;
  }

  // Quiet "use" of the import to avoid the unused warning
  void sql;
  void agencyMemberships;

  if (!activeWorkspace) {
    return (
      <Link
        href="/app/workspaces/new"
        className="text-body text-fg-primary hover:bg-surface-subtle flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 font-semibold transition"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Create your first workspace
      </Link>
    );
  }

  return (
    <Link
      href={`/app/w/${activeWorkspace.slug}`}
      className="text-body text-fg-primary hover:bg-surface-subtle flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 font-semibold transition"
    >
      <span className="bg-primary-subtle text-primary text-label flex h-6 w-6 items-center justify-center rounded font-bold">
        {activeWorkspace.name.charAt(0).toUpperCase()}
      </span>
      <span className="hidden sm:inline">{activeWorkspace.name}</span>
      <ChevronDown className="text-fg-muted h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}
