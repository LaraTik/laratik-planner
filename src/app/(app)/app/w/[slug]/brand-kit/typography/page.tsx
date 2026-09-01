import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { Type } from "lucide-react";
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
import { TypographyForm } from "../typography-form";
import { TypographyCards } from "../typography-cards";

type FontRole = "headline" | "body" | "accent" | "mono";

function readFontRole(asset: { value: unknown }): FontRole {
  const v = (asset.value ?? {}) as Record<string, unknown>;
  const role = typeof v.role === "string" ? v.role.toLowerCase() : "body";
  if (role === "headline" || role === "body" || role === "accent" || role === "mono") {
    return role;
  }
  return "body";
}

/**
 * /app/w/[slug]/brand-kit/typography — the Typography section
 * (Phase 7). Phase 9 will replace the form's `<datalist>` with
 * a proper searchable Combobox primitive.
 */
export default async function BrandKitTypographyPage({
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

  const fonts = await db
    .select()
    .from(brandAssets)
    .where(
      and(
        eq(brandAssets.workspaceId, workspace.id),
        eq(brandAssets.kind, "font"),
        isNull(brandAssets.archivedAt),
      ),
    );

  // Per-role count for the Brand Kit Health card. The role is
  // stored in the jsonb `value` column as `{family, weight, role}`;
  // we read it defensively because the legacy row format may not
  // have a `role` key (default to body).
  const breakdown = {
    headline: fonts.filter((f) => readFontRole(f) === "headline").length,
    body: fonts.filter((f) => readFontRole(f) === "body").length,
    accent: fonts.filter((f) => readFontRole(f) === "accent").length,
    mono: fonts.filter((f) => readFontRole(f) === "mono").length,
  };

  return (
    <div className="space-y-6">
      <BrandKitBackLink slug={slug} />
      <PageHeader
        eyebrow={t("brandKit.typographyEyebrow")}
        title={t("brandKit.typographyTitle")}
        description={t("brandKit.typographyDescription")}
      />
      <BrandKitHealth section="typography" slug={slug} count={fonts.length} breakdown={breakdown} />

      <SectionCard
        id="typography"
        title={
          <>
            <Type className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            Type system
          </>
        }
        count={fonts.length}
        fullWidth
        aria-label={t("brandKit.typographyAria")}
        data-testid="brand-kit-section-typography"
      >
        {canManage ? <TypographyForm slug={slug} t={t} /> : null}
        <TypographyCards slug={slug} canManage={canManage} assets={fonts} t={t} />
      </SectionCard>
    </div>
  );
}
