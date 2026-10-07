import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { findAgencySlugById, findReachableWorkspacesBySlug } from "@/lib/workspaces/context";
import { workspaceHref } from "@/lib/urls";

/**
 * Legacy `/app/w/[workspaceSlug]/…` → canonical `/app/a/[agencySlug]/w/[workspaceSlug]/…`
 *
 * WHY THIS EXISTS
 *
 * A workspace's identity is `(agencyId, slug)` — the uniqueness constraint is
 * per-agency, not global. The old route carried only the slug, so it meant "the
 * workspace with this slug in whatever agency the *visitor* currently has
 * active", resolved from the signed agency cookie. A link shared between
 * colleagues therefore either 404'd or silently opened a different tenant's
 * workspace. See `src/lib/urls.ts`.
 *
 * The canonical URL carries the agency, so links are self-describing. This
 * catch-all exists only so bookmarks, screenshots and already-shared links keep
 * resolving.
 *
 * RESOLUTION ORDER
 *
 *   1. Exactly one reachable workspace has this slug → go there. Unambiguous
 *      for this visitor, so there is nothing to ask them.
 *   2. More than one → genuinely ambiguous. Send them to the workspace
 *      switcher. Guessing is the bug being fixed; before this route existed
 *      the cookie made that guess invisibly and, for multi-agency users,
 *      wrongly.
 *   3. None → 404, preserving the anti-IDOR contract: a cross-tenant slug and a
 *      non-existent slug must be indistinguishable, or slugs become
 *      enumerable.
 *
 * Why not `permanentRedirect`: a 308 would let browsers cache the answer they
 * were first given. Rule 2's outcome depends on WHO is asking, so a cached
 * answer would freeze one visitor's resolution and hand it to everyone else.
 * 307 keeps the decision server-side, per request.
 */
export default async function LegacyWorkspaceRedirect({
  params,
}: {
  params: Promise<{ legacy?: string[] }>;
}) {
  const { legacy } = await params;
  const segments = legacy ?? [];
  const [workspaceSlug, ...rest] = segments;
  if (!workspaceSlug) notFound();

  const session = await auth();
  const actor = session?.user?.id ? { id: session.user.id } : null;
  if (!actor) notFound();

  const matches = await findReachableWorkspacesBySlug(actor, workspaceSlug);

  if (matches.length === 1) {
    const only = matches[0];
    if (only) redirect(workspaceHref(only.agencySlug, workspaceSlug, rest));
  }

  if (matches.length > 1) {
    redirect("/app/workspaces");
  }

  // Nothing reachable for this slug. If the visitor has an active agency we can
  // still land them somewhere useful — the canonical page will 404 with the
  // anti-IDOR contract intact, and a "switch agency" link keeps working.
  const ctx = await resolveActiveAgencyContext({ actor });
  if (ctx?.agencyId) {
    const agencySlug = await findAgencySlugById(ctx.agencyId);
    if (agencySlug) {
      redirect(workspaceHref(agencySlug, workspaceSlug, rest));
    }
  }

  notFound();
}
