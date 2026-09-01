import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { ImageIcon } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { brandAssets } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { tForActive } from "@/lib/i18n/t-for-active";
import { PageHeader } from "@/components/workspace/page-header";
import { SectionCard } from "@/components/workspace/section-card";
import { BrandKitHealth } from "../_components/brand-kit-health";
import { BrandKitBackLink } from "../_components/brand-kit-back-link";
import { LogoForm } from "../logo-form";
import { LogoGrid } from "../logo-grid";

/**
 * /app/w/[slug]/brand-kit/logos — the Logo Assets section, broken
 * out from the previous single-page Bento grid (Phase 7 rebuild).
 *
 * Same data shape, same form, same list — the page is the focused
 * surface for managing the workspace's logo library. The CRUD
 * actions are unchanged: `createLogoAssetAction`,
 * `archiveLogoAssetAction`, `restoreLogoAssetAction` are server
 * actions under `../actions` invoked from `LogoForm` and
 * `LogoGrid`.
 */
export default async function BrandKitLogosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { t } = await tForActive();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const canManage = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
  ]);

  const logos = await db
    .select()
    .from(brandAssets)
    .where(
      and(
        eq(brandAssets.workspaceId, workspace.id),
        eq(brandAssets.kind, "logo"),
        isNull(brandAssets.archivedAt),
      ),
    );

  return (
    <div className="space-y-6">
      <BrandKitBackLink slug={slug} />
      <PageHeader
        eyebrow={t("brandKit.logosEyebrow")}
        title={t("brandKit.logosTitle")}
        description={t("brandKit.logosDescription")}
      />
      <BrandKitHealth section="logos" slug={slug} count={logos.length} />

      <SectionCard
        id="logos"
        title={
          <>
            <ImageIcon className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            Logo assets
          </>
        }
        count={logos.length}
        fullWidth
        aria-label={t("brandKit.logosAria")}
        data-testid="brand-kit-section-logos"
      >
        {canManage ? <LogoForm slug={slug} workspaceId={workspace.id} /> : null}
        <LogoGrid slug={slug} canManage={canManage} assets={logos} t={t} />
      </SectionCard>
    </div>
  );
}
