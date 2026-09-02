import { redirect, notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import {
  Download,
  ImageIcon,
  Link2,
  MessageCircle,
  Palette,
  Tag,
  Type,
  BookOpen,
  History,
  Sparkles,
} from "lucide-react";
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
import { getSignedDownloadUrl } from "@/lib/storage";
import { safeHref } from "@/lib/utils/safe-href";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/workspace/page-header";
import { tForActive } from "@/lib/i18n/t-for-active";
import { BrandIdentityHero } from "./brand-identity-hero";
import { RecentUpdatesTable } from "./recent-updates-table";

/**
 * Brand Kit overview — the workspace landing for `/app/w/[slug]/brand-kit`.
 *
 * Phase 7 (this commit) replaces the previous single-page Bento grid
 * (Logos 8/Color 4/Typography 12/Voice 6/Pillars 6/Publishing 4/Linked 4/
 * Activity 12 + in-page top tabs) with a focused overview:
 *
 *   row 1  Brand identity hero (12)
 *   row 2  KPI grid: 6 section cards (2-up sm / 3-up lg / 6-up xl)
 *   row 3  Recent updates (12)
 *
 * Each KPI card is a deep link to the matching per-section page
 * (Logos / Colors / Typography / Voice / Pillars / Publishing +
 * Linked). Per-section CRUD is no longer on this page — it lives
 * on the per-section routes (see `logos/page.tsx`, etc.). The
 * Download ZIP CTA stays on the overview so a designer can grab
 * every asset in one click.
 *
 * `Activity` is exposed in two places: the Recent updates table on
 * this page (last 5–10 rows) and the dedicated `/activity` route
 * (the full feed, ready for Phase 7 per-actor / type filters).
 */
export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("brandKit.title") };
}

export default async function BrandKitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { t, code } = await tForActive();
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const canManage = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
  ]);
  // The overview page is read-only; the per-section routes gate
  // their own write capability. Both role checks are kept so the
  // future "manager-only KPIs" can switch on `canManage` without
  // a refactor; the per-section pages gate the actual mutations.
  void canManage;
  const canEditBrand = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    "workspace_manager",
    "content_planner",
  ]);
  void canEditBrand;

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

  const assetsByKind = {
    logo: assets.filter((a) => a.kind === "logo"),
    color: assets.filter((a) => a.kind === "color"),
    font: assets.filter((a) => a.kind === "font"),
  } as const;

  const firstLogo = assetsByKind.logo[0];
  const firstLogoRawSrc = firstLogo
    ? firstLogo.storagePath
      ? getSignedDownloadUrl(firstLogo.storagePath)
      : firstLogo.externalUrl
    : null;
  const firstLogoSafe = firstLogoRawSrc ? safeHref(firstLogoRawSrc) : null;
  const firstLogoSrc = firstLogoSafe && firstLogoSafe.href !== "#" ? firstLogoSafe.href : null;

  const totalAssetCount =
    assetsByKind.logo.length + assetsByKind.color.length + assetsByKind.font.length;

  const wsBase = `/app/w/${slug}/brand-kit`;

  return (
    <div className="space-y-6" data-testid="brand-kit-overview">
      <PageHeader
        eyebrow={workspace.name}
        title={t("brandKit.title")}
        description={t("brandKit.description")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              asChild={totalAssetCount > 0}
              disabled={totalAssetCount === 0}
              title={totalAssetCount === 0 ? t("brandKit.overview.downloadZipEmpty") : undefined}
              data-testid="brand-kit-export-zip"
            >
              {totalAssetCount > 0 ? (
                <a href={`/api/export/brand-assets-zip?slug=${encodeURIComponent(slug)}`} download>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {t("brandKit.overview.downloadZip")}
                </a>
              ) : (
                <span aria-disabled="true">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {t("brandKit.overview.downloadZip")}
                </span>
              )}
            </Button>
            <Button variant="outline" asChild>
              <a
                href={`/app/w/${slug}/brand-kit/templates`}
                data-testid="brand-kit-browse-templates"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {t("brandKit.overview.browseTemplates")}
              </a>
            </Button>
          </div>
        }
      />

      <BrandIdentityHero
        workspace={{ name: workspace.name, timezone: workspace.timezone }}
        logoSrc={firstLogoSrc ? safeHref(firstLogoSrc).href : null}
        logoAlt={firstLogo?.name}
        assetCount={totalAssetCount}
        logoCount={assetsByKind.logo.length}
        lastUpdatedAt={recent[0]?.updatedAt ?? null}
        locale={code}
        t={t}
      />

      <ul
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        data-testid="brand-kit-kpi-grid"
      >
        <KpiCard
          href={`${wsBase}/logos`}
          icon={ImageIcon}
          label={t("brandKit.section.logos")}
          count={assetsByKind.logo.length}
          testId="brand-kit-kpi-logos"
        />
        <KpiCard
          href={`${wsBase}/colors`}
          icon={Palette}
          label={t("brandKit.section.colors")}
          count={assetsByKind.color.length}
          testId="brand-kit-kpi-colors"
        />
        <KpiCard
          href={`${wsBase}/typography`}
          icon={Type}
          label={t("brandKit.section.typography")}
          count={assetsByKind.font.length}
          testId="brand-kit-kpi-typography"
        />
        <KpiCard
          href={`${wsBase}/voice`}
          icon={MessageCircle}
          label={t("brandKit.voiceTitle")}
          count={rules.length}
          testId="brand-kit-kpi-voice"
        />
        <KpiCard
          href={`${wsBase}/pillars`}
          icon={Tag}
          label={t("brandKit.section.pillars")}
          count={pillars.length}
          testId="brand-kit-kpi-pillars"
        />
        <KpiCard
          href={`${wsBase}/publishing`}
          icon={BookOpen}
          label={t("brandKit.publishingTitle")}
          count={publishingRules.length}
          testId="brand-kit-kpi-publishing"
        />
        <KpiCard
          href={`${wsBase}/linked`}
          icon={Link2}
          label={t("brandKit.linkedTitle")}
          count={linkedResources.length}
          testId="brand-kit-kpi-linked"
        />
        <KpiCard
          href={`${wsBase}/activity`}
          icon={History}
          label={t("brandKit.section.activity")}
          count={recent.length}
          testId="brand-kit-kpi-activity"
        />
      </ul>

      <section
        className="border-border bg-surface rounded-[var(--radius-card)] border p-4 sm:p-6"
        aria-label={t("brandKit.recentUpdatesAria")}
        data-testid="brand-kit-recent-section"
      >
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-section-title text-fg-primary font-semibold">
            {t("brandKit.overview.recentUpdates")}
          </h2>
          <a
            href={`${wsBase}/activity`}
            className="text-label text-primary font-semibold hover:underline"
            data-testid="brand-kit-recent-section-link"
          >
            {t("brandKit.overview.seeAllActivity")}
          </a>
        </header>
        <RecentUpdatesTable rows={recent.slice(0, 5)} t={t} locale={code} />
      </section>
    </div>
  );
}

function KpiCard({
  href,
  icon: Icon,
  label,
  count,
  testId,
}: {
  href: string;
  icon: typeof ImageIcon;
  label: string;
  count: number;
  testId: string;
}) {
  return (
    <li>
      <a
        href={href}
        data-testid={testId}
        className="border-border bg-surface hover:border-primary hover:bg-surface-subtle flex items-center gap-3 rounded-[var(--radius-card)] border p-4 transition-colors"
      >
        <span
          className="bg-primary-subtle text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)]"
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-label text-fg-muted block font-semibold tracking-wide uppercase">
            {label}
          </span>
          <span className="text-section-title text-fg-primary block font-semibold">{count}</span>
        </span>
      </a>
    </li>
  );
}
