import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { listContentPillars } from "@/lib/brand/service";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { SectionCard } from "@/components/workspace/section-card";
import { BrandKitHealth } from "../_components/brand-kit-health";
import { BrandKitBackLink } from "../_components/brand-kit-back-link";
import { PillarForm } from "../pillar-form";
import { PillarList } from "../pillar-list";

/**
 * /app/w/[slug]/brand-kit/pillars — the Content Pillars section.
 *
 * Phase 8 (C-5.4) ships the missing CRUD: managers and planners
 * can now create / archive / restore pillars directly from the
 * brand kit. The underlying service is the same one the
 * /library pillar manager uses (`lib/planning/pillars.ts`); this
 * route is the brand-kit surface for the same operations so
 * designers and strategists don't have to bounce out of the
 * brand-kit flow to curate the taxonomy.
 */
export default async function BrandKitPillarsPage({
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
  const canEdit = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
    "content_planner",
  ]);

  const pillars = await listContentPillars(workspace.id);

  return (
    <div className="space-y-6">
      <BrandKitBackLink slug={slug} />
      <PageHeader
        eyebrow={t("brandKit.pillarsEyebrow")}
        title={t("brandKit.pillarsTitle")}
        description={t("brandKit.pillarsDescription")}
      />
      <BrandKitHealth section="pillars" slug={slug} count={pillars.length} />

      <SectionCard
        id="pillars"
        title="Pillars"
        count={pillars.length}
        fullWidth
        aria-label="Content pillars"
        data-testid="brand-kit-section-pillars"
      >
        {canEdit ? <PillarForm slug={slug} /> : null}
        <PillarList slug={slug} canManage={canEdit} pillars={pillars} />
      </SectionCard>
    </div>
  );
}
