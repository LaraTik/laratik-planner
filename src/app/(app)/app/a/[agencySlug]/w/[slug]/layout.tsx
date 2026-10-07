import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspaceAtPath, getClientWorkspaceAtPath } from "@/lib/workspaces/context";

/**
 * Canonical workspace layout — `/app/a/[agencySlug]/w/[workspaceSlug]`.
 *
 * WHY THE AGENCY IS IN THE URL
 *
 * A workspace's identity is the tuple `(agencyId, slug)`; slugs are unique per
 * agency, not globally (`workspace_agency_slug_unique`). The route used to carry
 * only the slug and resolved the agency from the signed `laratik_active_agency`
 * cookie, so a shared link meant "whichever agency the RECIPIENT currently has
 * active" — it either 404'd or opened a different tenant's workspace. See
 * `src/lib/urls.ts`.
 *
 * Both segments now come from the URL, so the destination is identified rather
 * than inferred from recipient-side state. This is what makes a link
 * shareable.
 *
 * GATE (unchanged in spirit, now explicit)
 *
 *   1. No session → 404. Defense in depth behind the proxy.
 *   2. Resolve `(agencySlug, slug)`. `getAccessibleWorkspaceAtPath` maps the
 *      agency slug to an id ONLY for an active member, then resolves the
 *      workspace by `(agencyId, slug)` and checks the internal-workspace role.
 *      `getClientWorkspaceAtPath` is the same with the client-reviewer role.
 *   3. Any null → 404. NOT 403: a 403 would let an attacker distinguish
 *      "exists but you can't see it" from "doesn't exist", which makes slugs
 *      enumerable across tenants. 404 keeps the two indistinguishable.
 *
 * The layout no longer reads `resolveActiveAgencyContext` at all. That cookie
 * still drives the *switcher* (which agency the sidebar shows first), but it no
 * longer decides which workspace a URL points at — that is now the URL's job.
 *
 * Sidebars and nav still detect workspace context from the pathname; the
 * canonical prefix is what they match on now.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ agencySlug: string; slug: string }>;
}) {
  const { agencySlug, slug } = await params;
  const session = await auth();
  const actor = session?.user?.id ? { id: session.user.id } : null;
  if (!actor) notFound();

  const internalWorkspace = await getAccessibleWorkspaceAtPath(actor, agencySlug, slug);
  const clientWorkspace = internalWorkspace
    ? null
    : await getClientWorkspaceAtPath(actor, agencySlug, slug);

  if (!internalWorkspace && !clientWorkspace) {
    notFound();
  }

  return <>{children}</>;
}
