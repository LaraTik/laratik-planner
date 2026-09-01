import { redirect, notFound } from "next/navigation";
import { Link2 } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { listBrandLinkedResources } from "@/lib/brand/service";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { SectionCard } from "@/components/workspace/section-card";
import { BrandKitHealth } from "../_components/brand-kit-health";
import { BrandKitBackLink } from "../_components/brand-kit-back-link";
import { LinkedResourceForm } from "../linked-resource-form";
import { LinkedResourceList } from "../linked-resource-list";

/**
 * /app/w/[slug]/brand-kit/linked — the Linked Resources section
 * (Phase 7). Links to external design / asset libraries
 * (Figma, Drive, Canva, Dropbox). Linked resources are
 * intentionally NOT fed to the AI generation route — the
 * `listRecentBrandUpdates` lister already strips the `url` from
 * the activity feed for privacy (a viewer can see that a
 * resource exists but cannot pivot to the upstream library).
 */
export default async function BrandKitLinkedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { t } = await tForActive();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const canEditBrand = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
    "content_planner",
  ]);

  const resources = await listBrandLinkedResources(workspace.id);

  return (
    <div className="space-y-6">
      <BrandKitBackLink slug={slug} />
      <PageHeader
        eyebrow={t("brandKit.linkedEyebrow")}
        title={t("brandKit.linkedTitle")}
        description={t("brandKit.linkedDescription")}
      />
      <BrandKitHealth section="linked" slug={slug} count={resources.length} />

      <SectionCard
        id="linked"
        title={
          <>
            <Link2 className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            Resources
          </>
        }
        count={resources.length}
        fullWidth
        aria-label="Linked resources"
        data-testid="brand-kit-section-linked"
      >
        {canEditBrand ? <LinkedResourceForm slug={slug} /> : null}
        <LinkedResourceList slug={slug} canManage={canEditBrand} resources={resources} />
      </SectionCard>
    </div>
  );
}
