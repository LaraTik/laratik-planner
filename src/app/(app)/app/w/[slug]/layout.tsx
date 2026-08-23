import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getAccessibleWorkspace, getClientWorkspace } from "@/lib/workspaces/context";

/**
 * Workspace layout — Milestone 1.4 wiring.
 *
 * Two-step gate:
 *   1. Resolve the active agency for the current request. The
 *      resolver reads the `?agency=<id>` query param first (the
 *      explicit override), then the signed `laratik_active_agency`
 *      cookie, then falls back to the actor's single active agency.
 *      It returns `null` when no priority level yields a valid
 *      agency — we render 404 in that case.
 *   2. Resolve the workspace by `(agencyId, slug)`. The
 *      `getAccessibleWorkspace` / `getClientWorkspace` helpers
 *      accept the resolved `agencyId` and enforce the
 *      anti-IDOR contract: a non-member of the resolved agency
 *      gets `null` (NOT 403, NOT a leaked row). We render 404
 *      for any null — anti-IDOR, not access-denied. A 403 would
 *      let an attacker enumerate slugs in other agencies; a 404
 *      makes the cross-tenant case indistinguishable from a
 *      non-existent slug.
 *
 * The horizontal `WorkspaceNavigation` tab bar has been removed;
 * workspace nav now lives in the sidebar (per Stitch design,
 * project 5403097764334458790). The workspace context is
 * detected by the sidebar from the pathname.
 *
 * The auth check is a defense-in-depth gate in addition to the
 * proxy: if the proxy ever lets a request through without a
 * session, this layout throws rather than render the page.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const actor = session?.user?.id ? { id: session.user.id } : null;
  if (!actor) notFound();

  // Layouts do not receive `searchParams` in Next.js 16. Agency switching
  // writes the signed HttpOnly agency cookie before refreshing the route,
  // so the server-validated cookie is the canonical context here.
  const ctx = await resolveActiveAgencyContext({ actor });
  if (!ctx) notFound();

  // Step 2 — resolve the workspace within the resolved agency.
  // The helper applies the anti-IDOR membership gate first (via
  // `resolveActiveAgencyContext` internally, which subsumes the
  // explicit-param contract from M1.4); a non-member gets `null`
  // here, which we render as 404. The `ctx` we already computed
  // is the membership gate — the helper re-validates it.
  const internalWorkspace = await getAccessibleWorkspace(actor, slug, ctx.agencyId);
  const clientWorkspace = internalWorkspace
    ? null
    : await getClientWorkspace(actor, slug, ctx.agencyId);

  // Render children only if the user has access (internal or
  // client). Returning the children (not a redirect) keeps the
  // URL stable; the page-level data fetchers will still 404 for
  // unauthorized access.
  if (!internalWorkspace && !clientWorkspace) {
    notFound();
  }
  return <>{children}</>;
}
