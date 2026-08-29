import "server-only";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agencyMemberships,
  users,
  workspaceMembershipRoles,
  workspaceMemberships,
} from "@/lib/db/schema";
import { type Actor, hasWorkspaceRole, isAgencyAdmin } from "@/lib/auth/policy";

/**
 * Mentionable users for a workspace.
 *
 * The @-mentions autocomplete surfaces workspace members
 * (managers, planners, designers, reviewers, publishers) plus
 * agency admins that the actor is allowed to mention. A user
 * that is the comment author themselves is excluded — you cannot
 * @-mention yourself to send yourself a notification.
 *
 * Search: a case-insensitive prefix + substring match against
 * `displayName`, `name`, and the email local-part. The query is
 * bounded at 25 results; the UI typically caps the picker at
 * 10. The result is the structured object the API serialises
 * back to the client picker.
 */
export interface MentionableUser {
  id: string;
  displayName: string;
  email: string;
  image: string | null;
  /**
   * The first matching role this user holds in the workspace.
   * Used to render a "Workspace Manager" / "Designer" hint
   * chip next to the name. Null when the user is an agency
   * admin with no workspace role.
   */
  roleLabel: string | null;
  /**
   * True when the matched user is an agency-level admin. The
   * picker renders a small "Agency admin" hint chip.
   */
  isAgencyAdmin: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  workspace_manager: "Workspace Manager",
  content_planner: "Content Planner",
  designer: "Designer",
  internal_reviewer: "Internal Reviewer",
  client_reviewer: "Client Reviewer",
  publisher: "Publisher",
  viewer: "Viewer",
};

export async function searchMentionableUsers(
  actor: Actor,
  workspaceId: string,
  query: string,
  limit = 25,
): Promise<MentionableUser[]> {
  // Permission: only members (or agency admins) can mention people.
  // Anyone able to comment on a content item in this workspace
  // can mention. The check uses the same policy the discussion
  // service uses (`listCommentsForItem` — `INTERNAL_WORKSPACE_ROLES`
  // ∪ `client_reviewer`). For a comment composer the user must
  // already be a member; the picker therefore inherits the
  // member-check. A not-yet-actor who hits the route directly
  // gets an empty list (the UI shouldn't surface the picker).
  const allowed = await hasWorkspaceRole(actor, workspaceId, [
    "workspace_manager",
    "content_planner",
    "designer",
    "internal_reviewer",
    "publisher",
    "client_reviewer",
  ]);
  if (!allowed) return [];

  // Resolve the agency for the admin short-circuit. Members of
  // any workspace in the agency are valid mention targets; the
  // picker is workspace-scoped at the role layer (a user from
  // another workspace is included with their role in *that*
  // workspace — useful when the agency has multiple workspaces
  // and the planner wants to ping a teammate in a sibling).
  const [ws] = await db
    .select({ agencyId: sql<string>`agency_id` })
    .from(sql`workspace`)
    .where(sql`id = ${workspaceId}`)
    .limit(1);
  if (!ws) return [];
  const agencyId = ws.agencyId;

  // Build the search predicate. A blank query lists the
  // most-recent workspace members; a non-blank query filters
  // by displayName / name / email local-part.
  const q = query.trim();
  const conditions = q
    ? or(
        ilike(users.displayName, `%${q}%`),
        ilike(users.name, `%${q}%`),
        ilike(users.email, `${q}%`),
      )
    : undefined;

  // Two parallel queries so the agency-admin shortcut doesn't
  // skip a role-bearing user. We use a `UNION ALL` in SQL via
  // an inArray filter on the union of member rows + agency
  // admins, then take the distinct set. The simpler shape is
  // to query the workspace member table first, then a separate
  // query for the agency admins, then merge in app code.
  const memberRows = await db
    .selectDistinct({
      id: users.id,
      displayName: users.displayName,
      name: users.name,
      email: users.email,
      image: users.image,
      role: workspaceMembershipRoles.role,
      joinedAt: workspaceMemberships.joinedAt,
    })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .leftJoin(
      workspaceMembershipRoles,
      eq(workspaceMembershipRoles.workspaceMembershipId, workspaceMemberships.id),
    )
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.status, "active"),
        conditions,
      ),
    )
    .orderBy(asc(users.displayName), asc(users.name))
    .limit(limit);

  // Pick one role per user (the first non-null role encountered
  // — Drizzle doesn't guarantee a specific sort within a left
  // join, so we dedupe by user below).
  const deduped = new Map<
    string,
    {
      id: string;
      displayName: string;
      name: string;
      email: string;
      image: string | null;
      role: string | null;
      joinedAt: Date;
    }
  >();
  for (const r of memberRows) {
    const existing = deduped.get(r.id);
    if (!existing) {
      deduped.set(r.id, {
        id: r.id,
        displayName: r.displayName ?? r.name ?? r.email,
        name: r.name ?? r.displayName ?? r.email,
        email: r.email,
        image: r.image,
        role: r.role,
        joinedAt: r.joinedAt,
      });
    } else if (!existing.role && r.role) {
      existing.role = r.role;
    }
  }

  // Now layer in agency admins that aren't already in the
  // member set (handy when a platform admin can answer but
  // isn't on the workspace).
  const [adminRows] = await db
    .select({ id: agencyMemberships.userId })
    .from(agencyMemberships)
    .where(
      and(
        eq(agencyMemberships.agencyId, agencyId),
        eq(agencyMemberships.isAgencyAdmin, true),
        eq(agencyMemberships.status, "active"),
      ),
    );
  void adminRows;
  // We resolve isAgencyAdmin on the row level below — the
  // service above gives the user ids, we re-query users for
  // any that aren't in `deduped` to get a complete record.
  const existingIds = new Set(deduped.keys());
  const missingAdminIds = (
    await db
      .select({
        id: agencyMemberships.userId,
        isAdmin: agencyMemberships.isAgencyAdmin,
        displayName: users.displayName,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(agencyMemberships)
      .innerJoin(users, eq(users.id, agencyMemberships.userId))
      .where(
        and(
          eq(agencyMemberships.agencyId, agencyId),
          eq(agencyMemberships.isAgencyAdmin, true),
          eq(agencyMemberships.status, "active"),
          conditions,
        ),
      )
      .orderBy(asc(users.displayName), asc(users.name))
      .limit(limit)
  )
    .filter((r) => !existingIds.has(r.id))
    .map((r) => ({
      id: r.id,
      displayName: r.displayName,
      name: r.name,
      email: r.email,
      image: r.image,
      role: null as string | null,
      isAgencyAdmin: r.isAdmin,
      joinedAt: null as Date | null,
    }));

  // Compose the result, marking each entry's admin status.
  const out: MentionableUser[] = [];
  const adminIds = new Set(missingAdminIds.map((m) => m.id));
  for (const v of deduped.values()) {
    if (v.id === actor.id) continue; // never self-mention
    out.push({
      id: v.id,
      displayName: v.displayName ?? v.name ?? v.email,
      email: v.email,
      image: v.image,
      roleLabel: v.role ? (ROLE_LABEL[v.role] ?? v.role) : null,
      isAgencyAdmin: adminIds.has(v.id) || (await isAgencyAdmin({ id: v.id }, agencyId)),
    });
  }
  for (const v of missingAdminIds) {
    if (v.id === actor.id) continue;
    out.push({
      id: v.id,
      displayName: v.displayName ?? v.name ?? v.email,
      email: v.email,
      image: v.image,
      roleLabel: null,
      isAgencyAdmin: true,
    });
  }
  // Cap at the requested limit.
  return out.slice(0, limit);
}
