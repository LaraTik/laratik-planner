import Link from "next/link";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ArrowUpRight, Bookmark } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  researchBookmarks,
  researchCollections,
  researchTeardowns,
  researchWatchlistAccounts,
  socialChannels,
  socialPostObservations,
} from "@/lib/db/schema";
import { tForActive } from "@/lib/i18n/t-for-active";
import { formatDate } from "@/lib/i18n/format-locale";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { ResearchTeardownSchema } from "@/lib/research/teardown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/workspace/page-header";
import { ResearchWatchlist } from "@/components/workspace/research-watchlist";
import { ResearchTeardownPanel } from "@/components/workspace/research-teardown-panel";
import { ResearchCollectionPicker } from "@/components/workspace/research-collection-picker";
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
      accountName: socialChannels.accountName,
      platform: socialChannels.platform,
      mediaType: socialPostObservations.mediaType,
      permalink: socialPostObservations.permalink,
      publishedAt: socialPostObservations.publishedAt,
      views: socialPostObservations.views,
      likes: socialPostObservations.likes,
      comments: socialPostObservations.comments,
      collectionId: researchBookmarks.collectionId,
      savedAt: researchBookmarks.createdAt,
    })
    .from(researchBookmarks)
    .innerJoin(
      socialPostObservations,
      eq(socialPostObservations.id, researchBookmarks.socialPostObservationId),
    )
    .innerJoin(socialChannels, eq(socialChannels.id, socialPostObservations.socialChannelId))
    .where(
      and(
        eq(researchBookmarks.workspaceId, workspace.id),
        eq(socialChannels.workspaceId, workspace.id),
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

      <ResearchWatchlist
        workspaceSlug={slug}
        canManage={canManage}
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

      {rows.length === 0 ? (
        <Card variant="dashed" padding="lg">
          <div className="flex items-start gap-3">
            <Bookmark className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-title-card text-fg-primary font-semibold">
                {t("research.emptyTitle")}
              </h2>
              <p className="text-body text-fg-secondary mt-1 max-w-2xl">
                {t("research.emptyDescription")}
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const published = row.publishedAt
              ? formatDate(row.publishedAt, code, { dateStyle: "medium" })
              : null;
            const saved = formatDate(row.savedAt, code, { dateStyle: "medium" });
            return (
              <Card key={row.observationId} padding="md" className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body text-fg-primary truncate font-semibold">
                      <bdi>{row.accountName}</bdi>
                    </p>
                    <p className="text-label text-fg-muted mt-1 capitalize">
                      {row.platform} · {row.mediaType}
                      {published ? ` · ${published}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline">{t("research.savedAt", { date: saved })}</Badge>
                </div>
                <dl className="text-label text-fg-secondary grid grid-cols-3 gap-2">
                  <div>
                    <dt>{t("research.views")}</dt>
                    <dd className="text-fg-primary mt-0.5 font-semibold tabular-nums">
                      {formatNumber(row.views, code)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("research.likes")}</dt>
                    <dd className="text-fg-primary mt-0.5 font-semibold tabular-nums">
                      {formatNumber(row.likes, code)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("research.comments")}</dt>
                    <dd className="text-fg-primary mt-0.5 font-semibold tabular-nums">
                      {formatNumber(row.comments, code)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  {row.permalink ? (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={row.permalink} target="_blank" rel="noreferrer">
                        {t("research.openSource")}
                        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </Button>
                  ) : null}
                  <Button size="sm" asChild>
                    <Link
                      href={`/app/w/${encodeURIComponent(slug)}/planning/new?researchPostObservationId=${encodeURIComponent(row.observationId)}`}
                    >
                      {t("research.createBrief")}
                    </Link>
                  </Button>
                  {canManage ? (
                    <ResearchCollectionPicker
                      workspaceSlug={slug}
                      itemKind="bookmark"
                      itemId={row.bookmarkId}
                      initialCollectionId={row.collectionId}
                      collections={collectionRows.map((collection) => ({
                        ...collection,
                        shareScope: collection.shareScope as "me" | "workspace",
                      }))}
                      label={t("research.collectionLabel")}
                      noCollection={t("research.collectionNone")}
                      errorLabel={t("research.collectionError")}
                    />
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
