import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { Clock, Download, Tag } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { brandAssets, brandVoiceRules } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import {
  listBrandLinkedResources,
  listBrandPublishingRules,
  listContentPillars,
  listRecentBrandUpdates,
} from "@/lib/brand/service";
import { BRAND_KIT_SECTIONS } from "@/lib/brand/sections";
import { getSignedDownloadUrl } from "@/lib/storage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { WorkspaceTopTabs } from "@/components/workspace/top-tabs";
import { AddAssetMenu } from "./add-asset-menu";
import { BrandIdentityHero } from "./brand-identity-hero";
import { ColorForm } from "./color-form";
import { ColorSwatchGrid } from "./color-swatch-grid";
import { LinkedResourceForm } from "./linked-resource-form";
import { LinkedResourceList } from "./linked-resource-list";
import { LogoForm } from "./logo-form";
import { LogoGrid } from "./logo-grid";
import { PublishingRuleForm } from "./publishing-rule-form";
import { PublishingRuleList } from "./publishing-rule-list";
import { RecentUpdatesTable } from "./recent-updates-table";
import { TypographyCards } from "./typography-cards";
import { TypographyForm } from "./typography-form";
import { VoiceForm } from "./voice-form";
import { VoiceRuleList } from "./voice-rule-list";
import { safeHref } from "@/lib/utils/safe-href";

/**
 * Brand kit (Goal 4 master prompt §3) — workspace-scoped reference
 * for visual assets and writing guidance.
 *
 * Layout history:
 *   - M0–M3: 12-col Bento grid (Bento 12-col + Stitch top tabs).
 *   - Round 4 (this commit) — visual parity + UX polish:
 *       • Section content moved into dedicated components
 *         (`LogoGrid`, `ColorSwatchGrid`, `TypographyCards`,
 *         `VoiceRuleList`, `PublishingRuleList`,
 *         `LinkedResourceList`, `RecentUpdatesTable`,
 *         `BrandIdentityHero`). The page is now composition only.
 *       • Every section renders the same `<EmptyState>` (was a
 *         mix of `<p>` and `<EmptyState>`).
 *       • Archive buttons use `<ArchiveWithUndo>` so destructive
 *         actions ship with a 5s Sonner undo toast.
 *       • Recent Updates renders the real actor (display name +
 *         initials avatar) instead of a hardcoded "M".
 *       • Linked-resource links go through `safeHref` so a stray
 *         non-HTTPS row can never render a `javascript:` URL.
 *       • The "Add asset" header CTA is a real `<AddAssetMenu>`
 *         that scrolls to the matching section; the previous
 *         "Edit brand kit" stub is removed (it linked to `#logo`
 *         with no behavioural difference from the new menu).
 *
 * Section grid (per the Stitch HTML):
 *
 *   row 1  col-span-12  Brand identity hero (with first-logo preview)
 *   row 2  col-span-8   Logo Assets        col-span-4  Color Palette
 *   row 3  col-span-12  Typography
 *   row 4  col-span-6   Voice & tone       col-span-6  Content Pillars
 *   row 5  col-span-4   Publishing Rules   col-span-4  Linked Resources
 *   row 6  col-span-12  Recent Updates
 */
export default async function BrandKitPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const actor = { id: session.user.id };
  const canManage = await hasWorkspaceRole(actor, workspace.id, ["workspace_manager"]);
  const canEditBrand = await hasWorkspaceRole(actor, workspace.id, [
    "workspace_manager",
    "content_planner",
  ]);
  const [assets, rules, pillars, recent, publishingRules, linkedResources] = await Promise.all([
    db
      .select()
      .from(brandAssets)
      .where(and(eq(brandAssets.workspaceId, workspace.id), isNull(brandAssets.archivedAt))),
    db
      .select()
      .from(brandVoiceRules)
      .where(
        and(eq(brandVoiceRules.workspaceId, workspace.id), isNull(brandVoiceRules.archivedAt)),
      ),
    listContentPillars(workspace.id),
    listRecentBrandUpdates(workspace.id),
    listBrandPublishingRules(workspace.id),
    listBrandLinkedResources(workspace.id),
  ]);

  // Group assets by kind so the "Logo Assets" / "Color Palette" /
  // "Typography" sections can be populated from a single table.
  const assetsByKind = {
    logo: assets.filter((a) => a.kind === "logo"),
    color: assets.filter((a) => a.kind === "color"),
    font: assets.filter((a) => a.kind === "font"),
    other: assets.filter((a) => a.kind === "other"),
  } as const;

  // First logo (by createdAt desc) feeds the Brand Identity hero.
  const firstLogo = assetsByKind.logo[0];
  // Resolve the candidate src and route it through `safeHref` so a
  // corrupted `storage_path` (or a non-https `external_url` from an
  // older row pre-dating the Zod HTTPS constraint) cannot render an
  // attacker-controlled URL in the row-1 hero. If `safeHref` rejects
  // the URL it returns "#"; the hero's monogram fallback handles
  // a falsy `logoSrc`, so we collapse the rejected URL back to
  // `null` and let the monogram render.
  const firstLogoRawSrc = firstLogo
    ? firstLogo.storagePath
      ? getSignedDownloadUrl(firstLogo.storagePath)
      : firstLogo.externalUrl
    : null;
  const firstLogoSafe = firstLogoRawSrc ? safeHref(firstLogoRawSrc) : null;
  const firstLogoSrc = firstLogoSafe && firstLogoSafe.href !== "#" ? firstLogoSafe.href : null;

  const totalAssetCount =
    assetsByKind.logo.length +
    assetsByKind.color.length +
    assetsByKind.font.length +
    assetsByKind.other.length;

  // Top tabs now cover every section in the page so the strip
  // matches the actual anchor set. Counts on each tab reflect
  // the live section listers. The source of truth for the order,
  // label, and icon is `BRAND_KIT_SECTIONS`; the count is added
  // here from the lister results.
  const sectionCountById: Record<string, number> = {
    logo: assetsByKind.logo.length,
    color: assetsByKind.color.length,
    guidelines: assetsByKind.font.length,
    voice: rules.length,
    pillars: pillars.length,
    publishing: publishingRules.length,
    linked: linkedResources.length,
  };
  const tabs = BRAND_KIT_SECTIONS.map((section) => {
    const count = sectionCountById[section.id];
    return {
      id: section.id,
      label: section.label,
      icon: section.icon,
      ...(typeof count === "number" ? { count } : {}),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={workspace.name}
        title="Brand kit"
        description={
          <>
            The shared source for visual assets and writing guidance.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {workspace.timezone}
            </span>
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* FEAT-15 (GAP-FULL-REVIEW-2026-08-25) — bundle every
                active brand asset into a single ZIP for the
                designer / external partner handoff. The link is
                a plain <a download> so the browser handles the
                save dialog natively; the server endpoint
                enforces the role gate. Visible to every internal
                workspace member, not just managers.
                Round 5: disabled when there are no assets to
                bundle (a 0-asset workspace used to download a
                ZIP containing only a MANIFEST.txt — surprising). */}
            <Button
              variant="outline"
              asChild={totalAssetCount > 0}
              disabled={totalAssetCount === 0}
              title={
                totalAssetCount === 0
                  ? "Add at least one logo, color, or font before downloading."
                  : undefined
              }
              data-testid="brand-kit-export-zip"
            >
              {totalAssetCount > 0 ? (
                <a href={`/api/export/brand-assets-zip?slug=${encodeURIComponent(slug)}`} download>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download ZIP
                </a>
              ) : (
                <span aria-disabled="true">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download ZIP
                </span>
              )}
            </Button>
            {canManage ? <AddAssetMenu /> : null}
          </div>
        }
      />

      <WorkspaceTopTabs tabs={tabs} ariaLabel="Brand kit sections" />

      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:gap-4"
        data-testid="brand-kit-bento"
      >
        {/* Row 1 — Brand identity hero (12) */}
        <BrandIdentityHero
          workspace={{ name: workspace.name, timezone: workspace.timezone }}
          logoSrc={firstLogoSrc ? safeHref(firstLogoSrc).href : null}
          logoAlt={firstLogo?.name}
          assetCount={totalAssetCount}
          logoCount={assetsByKind.logo.length}
          lastUpdatedAt={recent[0]?.updatedAt ?? null}
        />

        {/* Row 2 — Logo (8) + Color (4) */}
        <Card
          id="logo"
          className="scroll-mt-20 lg:col-span-8"
          aria-label="Logo assets"
          data-testid="brand-kit-section-logo"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <CardTitle>Logo Assets</CardTitle>
            <Badge variant="outline" data-testid="brand-kit-logo-count">
              {assetsByKind.logo.length}
            </Badge>
          </div>
          {canManage ? <LogoForm slug={slug} workspaceId={workspace.id} /> : null}
          <LogoGrid slug={slug} canManage={canManage} assets={assetsByKind.logo} />
        </Card>

        <Card
          id="color"
          className="scroll-mt-20 lg:col-span-4"
          aria-label="Color palette"
          data-testid="brand-kit-section-color"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <CardTitle>Color Palette</CardTitle>
            <Badge variant="outline" data-testid="brand-kit-color-count">
              {assetsByKind.color.length}
            </Badge>
          </div>
          {canManage ? <ColorForm slug={slug} /> : null}
          <ColorSwatchGrid slug={slug} canManage={canManage} assets={assetsByKind.color} />
        </Card>

        {/* Row 3 — Typography (12) */}
        <Card
          id="guidelines"
          className="scroll-mt-20 lg:col-span-12"
          aria-label="Typography"
          data-testid="brand-kit-section-typography"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <CardTitle>Typography</CardTitle>
            <Badge variant="outline" data-testid="brand-kit-font-count">
              {assetsByKind.font.length}
            </Badge>
          </div>
          {canManage ? <TypographyForm slug={slug} /> : null}
          <TypographyCards slug={slug} canManage={canManage} assets={assetsByKind.font} />
        </Card>

        {/* Row 4 — Voice (6) + Pillars (6) */}
        <Card
          id="voice"
          className="scroll-mt-20 lg:col-span-6"
          aria-label="Voice and tone"
          data-testid="brand-kit-section-voice"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <CardTitle>Voice &amp; Tone</CardTitle>
            <Badge variant="outline" data-testid="brand-kit-voice-count">
              {rules.length}
            </Badge>
          </div>
          {canManage ? <VoiceForm slug={slug} /> : null}
          <VoiceRuleList slug={slug} canManage={canManage} rules={rules} />
        </Card>

        <Card
          id="pillars"
          className="scroll-mt-20 lg:col-span-6"
          aria-label="Content pillars"
          data-testid="brand-kit-section-pillars"
        >
          <CardTitle className="mb-3 inline-flex items-center gap-2">
            <Tag className="text-fg-secondary h-4 w-4" aria-hidden="true" />
            Content Pillars
            <Badge variant="outline" className="ml-1">
              {pillars.length}
            </Badge>
          </CardTitle>
          {pillars.length ? (
            <ul className="divide-border divide-y">
              {pillars.map((pillar) => (
                <li
                  key={pillar.id}
                  className="flex items-center justify-between py-3"
                  data-testid={`brand-pillar-${pillar.id}`}
                >
                  <div className="flex items-center gap-3">
                    {pillar.color ? (
                      <span
                        className="border-border h-4 w-4 shrink-0 rounded-full border"
                        style={{ backgroundColor: pillar.color }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="text-body text-fg-primary font-semibold">{pillar.name}</span>
                  </div>
                  {pillar.description ? (
                    <span className="text-label text-fg-muted ml-3 truncate">
                      {pillar.description}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-fg-muted py-4">No content pillars yet.</p>
          )}
        </Card>

        {/* Row 5 — Publishing (4) + Linked (4) */}
        <Card
          id="publishing"
          className="scroll-mt-20 lg:col-span-4"
          aria-label="Publishing rules"
          data-testid="brand-kit-section-publishing"
        >
          <CardTitle className="mb-3 inline-flex items-center gap-2">
            Publishing Rules
            <Badge variant="outline" className="ml-1">
              {publishingRules.length}
            </Badge>
          </CardTitle>
          {canEditBrand ? <PublishingRuleForm slug={slug} /> : null}
          <PublishingRuleList slug={slug} canManage={canEditBrand} rules={publishingRules} />
        </Card>

        <Card
          id="linked"
          className="scroll-mt-20 lg:col-span-4"
          aria-label="Linked resources"
          data-testid="brand-kit-section-linked"
        >
          <CardTitle className="mb-3 inline-flex items-center gap-2">
            Linked Resources
            <Badge variant="outline" className="ml-1">
              {linkedResources.length}
            </Badge>
          </CardTitle>
          {canEditBrand ? <LinkedResourceForm slug={slug} /> : null}
          <LinkedResourceList slug={slug} canManage={canEditBrand} resources={linkedResources} />
        </Card>

        {/* Row 6 — Recent Updates (12) */}
        <Card
          id="recent"
          className="scroll-mt-20 lg:col-span-12"
          aria-label="Recent updates"
          data-testid="brand-kit-section-recent"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <CardTitle>Recent Updates</CardTitle>
            <Badge variant="outline" data-testid="brand-kit-recent-count">
              {recent.length}
            </Badge>
          </div>
          <RecentUpdatesTable rows={recent} />
        </Card>
      </div>
    </div>
  );
}
