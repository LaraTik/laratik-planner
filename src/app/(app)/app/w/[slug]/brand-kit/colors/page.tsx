import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { Palette } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { brandAssets } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { PageHeader } from "@/components/workspace/page-header";
import { SectionCard } from "@/components/workspace/section-card";
import { BrandKitHealth } from "../_components/brand-kit-health";
import { BrandKitBackLink } from "../_components/brand-kit-back-link";
import { ColorForm } from "../color-form";
import { ColorSwatchGrid } from "../color-swatch-grid";

/**
 * /app/w/[slug]/brand-kit/colors — the Color Palette section,
 * broken out from the Bento grid (Phase 7). The form / grid /
 * archive / restore actions are unchanged from the previous
 * in-page section. Phase 8 will add a `color_role` column so
 * the grid can group swatches by primary / secondary / accent /
 * neutral.
 */
export default async function BrandKitColorsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const canManage = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
  ]);

  const colors = await db
    .select()
    .from(brandAssets)
    .where(
      and(
        eq(brandAssets.workspaceId, workspace.id),
        eq(brandAssets.kind, "color"),
        isNull(brandAssets.archivedAt),
      ),
    );

  return (
    <div className="space-y-6">
      <BrandKitBackLink slug={slug} />
      <PageHeader
        eyebrow="Identity"
        title="Colors"
        description="Primary, secondary, accent, and neutral hexes. Designers and copywriters grab the hex with one click."
      />
      <BrandKitHealth section="colors" slug={slug} count={colors.length} />

      <SectionCard
        id="colors"
        title={
          <>
            <Palette className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            Color palette
          </>
        }
        count={colors.length}
        fullWidth
        aria-label="Color palette"
        data-testid="brand-kit-section-colors"
      >
        {canManage ? <ColorForm slug={slug} /> : null}
        <ColorSwatchGrid slug={slug} canManage={canManage} assets={colors} />
      </SectionCard>
    </div>
  );
}
