import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace, getClientWorkspace } from "@/lib/workspaces/context";

/**
 * Workspace layout — gates the workspace-scoped routes, then renders
 * the page content directly. The horizontal `WorkspaceNavigation`
 * tab bar has been removed; workspace nav now lives in the sidebar
 * (per Stitch design, project 5403097764334458790). The workspace
 * context is detected by the sidebar from the pathname.
 *
 * The auth check is a defense-in-depth gate in addition to the
 * proxy: if the proxy ever lets a request through without a session,
 * this layout will throw rather than render the page.
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
  const internalWorkspace = actor ? await getAccessibleWorkspace(actor, slug) : null;
  const clientWorkspace =
    actor && !internalWorkspace ? await getClientWorkspace(actor, slug) : null;
  // Render children only if the user has access (internal or client).
  // Returning the children (not a redirect) keeps the URL stable; the
  // page-level data fetchers will still 404 for unauthorized access.
  if (!internalWorkspace && !clientWorkspace) {
    return null;
  }
  return <>{children}</>;
}
