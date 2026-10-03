import Link from "next/link";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ResearchEvidenceGrid } from "@/components/workspace/research-evidence-grid";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  researchBookmarks,
  researchCollections,
  researchTeardowns,
  researchWatchlistAccounts,
  researchWatchlistMembers,
  researchWatchlists,
  socialChannels,
  socialPostObservations,
} from "@/lib/db/schema";
import { tForActive } from "@/lib/i18n/t-for-active";
import { formatDate } from "@/lib/i18n/format-locale";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { ResearchTeardownSchema } from "@/lib/research/teardown";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/workspace/page-header";
import { ResearchWatchlist } from "@/components/workspace/research-watchlist";
import { ResearchWatchlists } from "@/components/workspace/research-watchlists";
import { ResearchTeardownPanel } from "@/components/workspace/research-teardown-panel";
import { ResearchCollections } from "@/components/workspace/research-collections";

function formatNumber(value: number | null, locale: string) {
  return value === null
    ? "—"
    : new Intl.NumberFormat(locale, { numberingSystem: "latn", maximumFractionDigits: 0 }).format(
        value,
      );
}

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("research.title") };
}

export default async function ResearchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  const workspace = await getAccessibleWorkspace(actor, slug);
  if (!workspace) redirect("/app");
  const canView = await hasWorkspaceRole(actor, workspace.id, [
    "workspace_manager",
    "content_planner",
    "content_reviewer",
  ]);
  if (!canView) redirect("/app");
  const canManage = await hasWorkspaceRole(actor, workspace.id, [
    "workspace_manager",
    "content_planner",
  ]);

  const { t, code } = await tForActive();
  const rows = await db
    .select({
      bookmarkId: researchBookmarks.id,
      observationId: socialPostObservations.id,
      accountName: sql<string | null>`coalesce(
        ${socialChannels.accountName},
        ${researchWatchlistAccounts.displayName},
        ${researchWatchlistAccounts.handle}
      )`,
      platform: sql<string>`coalesce(${socialChannels.platform}, ${researchWatchlistAccounts.platform})`,
      mediaType: socialPostObservations.mediaType,
      permalink: socialPostObservations.permalink,
      publishedAt: socialPostObservations.publishedAt,
      views: socialPostObservations.views,
      reach: socialPostObservations.reach,
      likes: socialPostObservations.likes,
      comments: socialPostObservations.comments,
      saved: socialPostObservations.saved,
      shares: socialPostObservations.shares,
      interactions: socialPostObservations.interactions,
      collectionId: researchBookmarks.collectionId,
      savedAt: researchBookmarks.createdAt,
    })
    .from(researchBookmarks)
    .innerJoin(
      socialPostObservations,
      eq(socialPostObservations.id, researchBookmarks.socialPostObservationId),
    )
    .leftJoin(socialChannels, eq(socialChannels.id, socialPostObservations.socialChannelId))
    .leftJoin(
      researchWatchlistAccounts,
      eq(researchWatchlistAccounts.id, socialPostObservations.researchWatchlistAccountId),
    )
    .where(
      and(
        eq(researchBookmarks.workspaceId, workspace.id),
        or(
          eq(socialChannels.workspaceId, workspace.id),
          eq(researchWatchlistAccounts.workspaceId, workspace.id),
        ),
      ),
    )
    .orderBy(desc(researchBookmarks.createdAt))
    .limit(100);
  const watchlistRows = await db
    .select({
      id: researchWatchlistAccounts.id,
      platform: researchWatchlistAccounts.platform,
      handle: researchWatchlistAccounts.handle,
      displayName: researchWatchlistAccounts.displayName,
      sourceUrl: researchWatchlistAccounts.sourceUrl,
      providerStatus: researchWatchlistAccounts.providerStatus,
    })
    .from(researchWatchlistAccounts)
    .where(
      and(
        eq(researchWatchlistAccounts.workspaceId, workspace.id),
        isNull(researchWatchlistAccounts.archivedAt),
      ),
    )
    .orderBy(desc(researchWatchlistAccounts.createdAt))
    .limit(50);
  const namedWatchlistRows = await db
    .select({
      id: researchWatchlists.id,
      name: researchWatchlists.name,
      description: researchWatchlists.description,
      shareScope: researchWatchlists.shareScope,
    })
    .from(researchWatchlists)
    .where(
      and(
        eq(researchWatchlists.workspaceId, workspace.id),
        isNull(researchWatchlists.archivedAt),
        or(
          eq(researchWatchlists.shareScope, "workspace"),
          eq(researchWatchlists.createdBy, actor.id),
        ),
      ),
    )
    .orderBy(researchWatchlists.name);
  const namedWatchlistMembers = namedWatchlistRows.length
    ? await db
        .select({
          watchlistId: researchWatchlistMembers.watchlistId,
          accountId: researchWatchlistMembers.accountId,
          position: researchWatchlistMembers.position,
        })
        .from(researchWatchlistMembers)
        .innerJoin(
          researchWatchlists,
          eq(researchWatchlists.id, researchWatchlistMembers.watchlistId),
        )
        .where(eq(researchWatchlists.workspaceId, workspace.id))
    : [];
  const namedWatchlists = namedWatchlistRows.map((watchlist) => ({
    ...watchlist,
    shareScope: watchlist.shareScope as "me" | "workspace",
    accountIds: namedWatchlistMembers
      .filter((member) => member.watchlistId === watchlist.id)
      .sort((a, b) => a.position - b.position)
      .map((member) => member.accountId),
    memberPositions: Object.fromEntries(
      namedWatchlistMembers
        .filter((member) => member.watchlistId === watchlist.id)
        .map((member) => [member.accountId, member.position]),
    ),
  }));
  const teardownRows = await db
    .select()
    .from(researchTeardowns)
    .where(eq(researchTeardowns.workspaceId, workspace.id))
    .orderBy(desc(researchTeardowns.createdAt))
    .limit(50);
  const collectionRows = await db
    .select({
      id: researchCollections.id,
      name: researchCollections.name,
      description: researchCollections.description,
      shareScope: researchCollections.shareScope,
      createdBy: researchCollections.createdBy,
    })
    .from(researchCollections)
    .where(
      and(
        eq(researchCollections.workspaceId, workspace.id),
        or(
          eq(researchCollections.shareScope, "workspace"),
          eq(researchCollections.createdBy, actor.id),
        ),
      ),
    )
    .orderBy(desc(researchCollections.createdAt));

  return (
    <div className="space-y-6" data-testid="research-page">
      <PageHeader
        eyebrow={t("research.eyebrow")}
        title={t("research.title")}
        description={t("research.description")}
        action={
          <Button variant="outline" asChild>
            <Link href={`/app/w/${slug}`}>
              {t("workspaceOverviewDashboard.commandCenter.title")}
            </Link>
          </Button>
        }
      />

      <ResearchCollections
        workspaceSlug={slug}
        canManage={canManage}
        initialCollections={collectionRows.map((row) => ({
          ...row,
          shareScope: row.shareScope as "me" | "workspace",
        }))}
        labels={{
          title: t("research.collectionsTitle"),
          description: t("research.collectionsDescription"),
          name: t("research.collectionName"),
          namePlaceholder: t("research.collectionNamePlaceholder"),
          shareScope: t("research.collectionShareScope"),
          privateScope: t("research.collectionPrivate"),
          workspaceScope: t("research.collectionWorkspace"),
          create: t("research.collectionCreate"),
          creating: t("research.collectionCreating"),
          duplicate: t("research.collectionDuplicate"),
          error: t("research.collectionError"),
        }}
      />

      <ResearchWatchlists
        workspaceSlug={slug}
        canManage={canManage}
        initialWatchlists={namedWatchlists}
        accounts={watchlistRows.map((row) => ({
          id: row.id,
          label: row.displayName || `@${row.handle}`,
          handle: `@${row.handle}`,
        }))}
        labels={{
          title: t("research.watchlistsTitle"),
          description: t("research.watchlistsDescription"),
          addTitle: t("research.watchlistsAddTitle"),
          name: t("research.watchlistsName"),
          namePlaceholder: t("research.watchlistsNamePlaceholder"),
          shareScope: t("research.watchlistsShareScope"),
          privateScope: t("research.watchlistsPrivate"),
          workspaceScope: t("research.watchlistsWorkspace"),
          create: t("research.watchlistsCreate"),
          creating: t("research.watchlistsCreating"),
          duplicate: t("research.watchlistsDuplicate"),
          error: t("research.watchlistsError"),
          accountCount: t("research.watchlistsAccountCount"),
          members: t("research.watchlistsMembers"),
          target: t("research.watchlistsTarget"),
          moveUp: t("research.watchlistsMoveUp"),
          moveDown: t("research.watchlistsMoveDown"),
          copy: t("research.watchlistsCopy"),
          move: t("research.watchlistsMove"),
          archive: t("research.watchlistsArchive"),
          archiving: t("research.watchlistsArchiving"),
        }}
      />

      <ResearchWatchlist
        workspaceSlug={slug}
        canManage={canManage}
        watchlists={namedWatchlists}
        initialAccounts={watchlistRows.map((row) => ({
          ...row,
          platform: row.platform as "instagram" | "facebook" | "tiktok" | "youtube",
          providerStatus: row.providerStatus as "manual" | "available" | "unsupported" | "error",
        }))}
        labels={{
          title: t("research.watchlistTitle"),
          description: t("research.watchlistDescription"),
          addTitle: t("research.watchlistAddTitle"),
          platform: t("research.watchlistPlatform"),
          handle: t("research.watchlistHandle"),
          displayName: t("research.watchlistDisplayName"),
          sourceUrl: t("research.watchlistSourceUrl"),
          add: t("research.watchlistAdd"),
          sourceOnly: t("research.watchlistSourceOnly"),
          providerAvailable: t("research.watchlistProviderAvailable"),
          providerUnsupported: t("research.watchlistProviderUnsupported"),
          providerError: t("research.watchlistProviderError"),
          remove: t("research.watchlistRemove"),
          error: t("research.watchlistError"),
          invalid: t("research.watchlistInvalid"),
          duplicate: t("research.watchlistDuplicate"),
          membership: t("research.watchlistMembership"),
          membershipDescription: t("research.watchlistMembershipDescription"),
          membershipError: t("research.watchlistMembershipError"),
        }}
      />

      <ResearchTeardownPanel
        workspaceSlug={slug}
        locale={code}
        canManage={canManage}
        initialSaved={teardownRows.flatMap((row) => {
          const parsed = ResearchTeardownSchema.safeParse(row.result);
          return parsed.success
            ? [
                {
                  id: row.id,
                  createdAt: row.createdAt.toISOString(),
                  collectionId: row.collectionId,
                  teardown: parsed.data,
                },
              ]
            : [];
        })}
        collections={collectionRows.map((row) => ({
          ...row,
          shareScope: row.shareScope as "me" | "workspace",
        }))}
        collectionLabels={{
          label: t("research.collectionLabel"),
          noCollection: t("research.collectionNone"),
          error: t("research.collectionError"),
        }}
        labels={{
          title: t("research.teardownTitle"),
          description: t("research.teardownDescription"),
          sourceLabel: t("research.teardownSourceLabel"),
          sourcePlaceholder: t("research.teardownSourcePlaceholder"),
          run: t("research.teardownRun"),
          running: t("research.teardownRunning"),
          previewOnly: t("research.teardownPreviewOnly"),
          hook: t("research.teardownHook"),
          promise: t("research.teardownPromise"),
          format: t("research.teardownFormat"),
          pacing: t("research.teardownPacing"),
          callToAction: t("research.teardownCallToAction"),
          beats: t("research.teardownBeats"),
          evidence: t("research.teardownEvidence"),
          uncertainty: t("research.teardownUncertainty"),
          unavailable: t("research.teardownUnavailable"),
          error: t("research.teardownError"),
          notesRequired: t("research.teardownNotesRequired"),
          save: t("research.teardownSave"),
          saving: t("research.teardownSaving"),
          saved: t("research.teardownSaved"),
          savedTitle: t("research.teardownSavedTitle"),
          savedDescription: t("research.teardownSavedDescription"),
          saveError: t("research.teardownSaveError"),
          createDraft: t("research.teardownCreateDraft"),
        }}
      />

      <ResearchEvidenceGrid
        workspaceSlug={slug}
        slug={slug}
        canManage={canManage}
        rows={rows.map((row) => ({
          ...row,
          accountName: row.accountName,
          mediaType: row.mediaType,
          publishedAt: row.publishedAt?.toISOString() ?? null,
          savedAt: row.savedAt.toISOString(),
          publishedLabel: row.publishedAt
            ? formatDate(row.publishedAt, code, { dateStyle: "medium" })
            : null,
          savedLabel: formatDate(row.savedAt, code, { dateStyle: "medium" }),
          viewsLabel: formatNumber(row.views, code),
          likesLabel: formatNumber(row.likes, code),
          commentsLabel: formatNumber(row.comments, code),
        }))}
        collections={collectionRows.map((collection) => ({
          ...collection,
          shareScope: collection.shareScope as "me" | "workspace",
        }))}
        labels={{
          title: t("research.evidenceTitle"),
          description: t("research.evidenceDescription"),
          emptyTitle: t("research.emptyTitle"),
          emptyDescription: t("research.emptyDescription"),
          search: t("research.evidenceSearch"),
          searchPlaceholder: t("research.evidenceSearchPlaceholder"),
          platform: t("research.evidencePlatform"),
          allPlatforms: t("research.evidenceAllPlatforms"),
          sort: t("research.evidenceSort"),
          newest: t("research.evidenceSortNewest"),
          recentlyPublished: t("research.evidenceSortPublished"),
          mostViews: t("research.evidenceSortViews"),
          mostLikes: t("research.evidenceSortLikes"),
          mostComments: t("research.evidenceSortComments"),
          sortEngagement: t("research.evidenceSortEngagement"),
          sortOutlier: t("research.evidenceSortOutlier"),
          results: t("research.evidenceResults"),
          filteredEmptyTitle: t("research.evidenceFilteredEmptyTitle"),
          filteredEmptyDescription: t("research.evidenceFilteredEmptyDescription"),
          openSource: t("research.openSource"),
          createBrief: t("research.createBrief"),
          savedAt: t("research.savedAt", { date: "{date}" }),
          collectionLabel: t("research.collectionLabel"),
          collectionNone: t("research.collectionNone"),
          collectionError: t("research.collectionError"),
          views: t("research.views"),
          likes: t("research.likes"),
          comments: t("research.comments"),
          engagementRate: t("research.evidenceEngagementRate"),
          outlierScore: t("research.evidenceOutlierScore"),
          derivedMetric: t("research.evidenceDerivedMetric"),
          peerSample: t("research.evidencePeerSample"),
          compare: t("research.evidenceCompare"),
          compareSelected: t("research.evidenceCompareSelected", { count: "{count}" }),
          compareTitle: t("research.evidenceCompareTitle"),
          compareDescription: t("research.evidenceCompareDescription"),
          clearComparison: t("research.evidenceClearComparison"),
        }}
      />
    </div>
  );
}
