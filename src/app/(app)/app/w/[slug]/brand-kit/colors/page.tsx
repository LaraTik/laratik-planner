import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { Palette } from "lucide-react";
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
import { ColorForm } from "../color-form";
import { ColorSwatchGrid } from "../color-swatch-grid";

type ColorRole = "primary" | "secondary" | "accent" | "neutral";

function readColorRole(asset: { colorRole?: unknown; value: unknown }): ColorRole | null {
  const col = asset.colorRole;
  if (col === "primary" || col === "secondary" || col === "accent" || col === "neutral") {
    return col;
  }
  const v = (asset.value ?? {}) as Record<string, unknown>;
  const jsonb = v.role ?? v.colorRole;
  if (jsonb === "primary" || jsonb === "secondary" || jsonb === "accent" || jsonb === "neutral") {
    return jsonb;
  }
  return null;
}

/**
 * /app/w/[slug]/brand-kit/colors — the Color Palette section,
 * broken out from the Bento grid (Phase 7). Phase 8 adds a
 * `color_role` column (primary / secondary / accent / neutral) so
 * the grid can group swatches by role and the AI generation route
 * can include the role in the brand visuals payload.
 */
export default async function BrandKitColorsPage({
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

  // Per-role breakdown so the Brand Kit Health card can tell the
  // user which palette slots are still empty. Reads from the new
  // `color_role` column (Phase 8); legacy rows fall back to the
  // jsonb `value.role` so the page renders sensibly for workspaces
  // created before the migration.
  const breakdown = {
    primary: colors.filter((c) => readColorRole(c) === "primary").length,
    secondary: colors.filter((c) => readColorRole(c) === "secondary").length,
    accent: colors.filter((c) => readColorRole(c) === "accent").length,
    neutral: colors.filter((c) => readColorRole(c) === "neutral").length,
  };

  return (
    <div className="space-y-6">
      <BrandKitBackLink slug={slug} />
      <PageHeader
        eyebrow={t("brandKit.colorsEyebrow")}
        title={t("brandKit.colorsTitle")}
        description={t("brandKit.colorsDescription")}
      />
      <BrandKitHealth section="colors" slug={slug} count={colors.length} breakdown={breakdown} />

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
        aria-label={t("brandKit.colorsAria")}
        data-testid="brand-kit-section-colors"
      >
        {canManage ? <ColorForm slug={slug} t={t} /> : null}
        <ColorSwatchGrid slug={slug} canManage={canManage} assets={colors} t={t} />
      </SectionCard>
    </div>
  );
}
