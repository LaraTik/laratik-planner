import * as React from "react";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { SettingsBreadcrumb } from "./_components/settings-breadcrumb";

/**
 * Settings route group layout — shared auth + workspace gate and
 * the workspace breadcrumb. All editable settings sections live
 * on the overview page and use anchors; legacy section paths are
 * compatibility redirects to those anchors.
 *
 * Per-page PageHeader still lives inside each page so the title
 * and per-section actions stay contextual.
 */
export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ agencySlug: string; slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { agencySlug, slug } = await params;
  const workspace = await getAccessibleWorkspaceAtPath({ id: session.user.id }, agencySlug, slug);
  if (!workspace) notFound();

  return (
    <div className="space-y-4" data-testid="settings-layout">
      <SettingsBreadcrumb workspaceName={workspace.name} />
      {children}
    </div>
  );
}
