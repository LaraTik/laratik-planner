import * as React from "react";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { BrandKitBreadcrumb } from "./_components/brand-kit-breadcrumb";

/**
 * Brand Kit route group layout — wraps every page under
 * `/app/w/[slug]/brand-kit/*` with a shared auth + workspace
 * check, and renders a small breadcrumb / sub-header strip that
 * makes the section-nav state obvious when navigating between
 * per-section pages.
 *
 * The previous brand-kit was a single page (Bento grid + in-page
 * top tabs). Phase 7 of the rebuild splits it into per-section
 * pages; the layout is the natural place for cross-section chrome
 * (breadcrumbs, workspace summary, page-header Download ZIP CTA).
 *
 * Per-page PageHeader still lives inside each page so the title
 * and per-section actions stay contextual.
 */
export default async function BrandKitLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  return (
    <div className="space-y-4" data-testid="brand-kit-layout">
      <BrandKitBreadcrumb workspaceName={workspace.name} />
      {children}
    </div>
  );
}
