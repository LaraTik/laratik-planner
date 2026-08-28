import * as React from "react";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { SettingsBreadcrumb } from "./_components/settings-breadcrumb";

/**
 * Settings route group layout — shared auth + workspace gate + a
 * breadcrumb that makes the per-section state obvious. Phase A
 * (Settings refactor) splits the previous single-page settings
 * surface (one Card with 5 anchor fieldsets) into 4 per-section
 * routes plus an overview. The layout wraps every page in the
 * group so the breadcrumb is consistent and we don't repeat the
 * auth/workspace check in each page.
 *
 * Per-page PageHeader still lives inside each page so the title
 * and per-section actions stay contextual.
 */
export default async function SettingsLayout({
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
    <div className="space-y-4" data-testid="settings-layout">
      <SettingsBreadcrumb workspaceName={workspace.name} />
      {children}
    </div>
  );
}
