import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { getBrandProfile } from "@/lib/brand/profile";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { BrandProfileForm } from "../brand-profile-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("brandKit.profile.title") };
}

export default async function BrandProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  if (
    !(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
      "workspace_manager",
      "content_planner",
    ]))
  )
    notFound();
  const { t } = await tForActive();
  const existing = await getBrandProfile(workspace.id);
  return (
    <div className="space-y-5" data-testid="brand-profile-page">
      <PageHeader
        eyebrow={workspace.name}
        title={t("brandKit.profile.title")}
        description={t("brandKit.profile.description")}
      />
      <BrandProfileForm slug={slug} initial={existing?.profile ?? null} />
    </div>
  );
}
