import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, workspaces, workspaceMemberships } from "@/lib/db/schema";
import { isActiveMember, setActiveAgencyCookie } from "@/lib/auth/agency-context";
import { isAgencyAdmin, type Actor } from "@/lib/auth/policy";
import { workspaceHref } from "@/lib/urls";

export type AgencySwitchOutcome =
  { ok: true; destination: string } | { ok: false; reason: "not-a-member" | "no-secret" };

/** Authorize a switch, set the signed context cookie, and resolve its landing page. */
export async function switchAgencyContext(
  actor: Actor,
  agencyId: string,
): Promise<AgencySwitchOutcome> {
  if (!(await isActiveMember(actor, agencyId))) {
    return { ok: false, reason: "not-a-member" };
  }
  if (!(await setActiveAgencyCookie(actor, agencyId))) {
    return { ok: false, reason: "no-secret" };
  }

  const admin = await isAgencyAdmin(actor, agencyId);

  // The agency slug and the landing workspace are independent reads — issue
  // them together rather than paying two sequential round-trips on the exact
  // interaction the user is complaining about.
  // The agency slug is JOINED onto the landing workspace rather than fetched
  // separately. Two queries meant two chances to come back empty, and an
  // empty agency is what forced the legacy fallback below. One query has no
  // such failure mode: if the workspace exists, its agency does too.
  const landingRows = admin
    ? await db
        .select({ slug: workspaces.slug, agencySlug: agencies.slug })
        .from(workspaces)
        .innerJoin(agencies, eq(agencies.id, workspaces.agencyId))
        .where(and(eq(workspaces.agencyId, agencyId), eq(workspaces.status, "active")))
        .orderBy(asc(workspaces.name))
        .limit(1)
    : await db
        .select({ slug: workspaces.slug, agencySlug: agencies.slug })
        .from(workspaceMemberships)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
        .innerJoin(agencies, eq(agencies.id, workspaces.agencyId))
        .where(
          and(
            eq(workspaceMemberships.userId, actor.id),
            eq(workspaceMemberships.status, "active"),
            eq(workspaces.agencyId, agencyId),
            eq(workspaces.status, "active"),
          ),
        )
        .orderBy(asc(workspaces.name))
        .limit(1);

  const first = landingRows[0];
  if (!first) return { ok: true, destination: "/app" };

  // Emit the CANONICAL `/app/a/<agencySlug>/w/<slug>` destination, not the
  // legacy `/app/w/<slug>` shape.
  //
  // The legacy shape cost a full extra request on every tenant switch: it is
  // a page inside the `(app)` route group, so Next renders the ENTIRE
  // authenticated app shell (sidebar, badges, workspace list — the most
  // expensive part of any navigation) only for that page to immediately
  // answer `redirect()` and have the browser re-request the real URL. The
  // shell work is computed, serialised, and thrown away, then paid again.
  // The switch already knows the target agency, so it can address the
  // workspace canonically and skip the hop entirely. The agency slug comes
  // from the same row as the workspace, so there is no branch that can fall
  // back to the legacy shape.
  //
  // The legacy route stays in place for old bookmarks and already-shared
  // links — this only stops the app from GENERATING those URLs.
  return {
    ok: true,
    destination: workspaceHref(first.agencySlug, first.slug),
  };
}
