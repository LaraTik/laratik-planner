import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { Type } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { brandAssets } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { PageHeader } from "@/components/workspace/page-header";
import { SectionCard } from "@/components/workspace/section-card";
import { BrandKitHealth } from "../_components/brand-kit-health";
import { BrandKitBackLink } from "../_components/brand-kit-back-link";
import { TypographyForm } from "../typography-form";
import { TypographyCards } from "../typography-cards";

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

  return (
    <div className="space-y-6">
      <BrandKitBackLink slug={slug} />
      <PageHeader
        eyebrow="Identity"
        title="Typography"
        description="The headline, body, accent, and mono faces that every asset should ship in. Each entry renders a live sample."
      />
      <BrandKitHealth section="typography" slug={slug} count={fonts.length} />

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
        aria-label="Typography"
        data-testid="brand-kit-section-typography"
      >
        {canManage ? <TypographyForm slug={slug} /> : null}
        <TypographyCards slug={slug} canManage={canManage} assets={fonts} />
      </SectionCard>
    </div>
  );
}
