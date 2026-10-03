"use client";

import * as React from "react";
import { ArrowUpRight, Bookmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ResearchCollectionPicker } from "@/components/workspace/research-collection-picker";

export type ResearchEvidenceRow = {
  bookmarkId: string;
  observationId: string;
  accountName: string | null;
  platform: string;
  mediaType: string | null;
  permalink: string | null;
  publishedAt: string | null;
  savedAt: string;
  publishedLabel: string | null;
  savedLabel: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  viewsLabel: string;
  likesLabel: string;
  commentsLabel: string;
  collectionId: string | null;
};

type Collection = {
  id: string;
  name: string;
  description: string | null;
  shareScope: "me" | "workspace";
  createdBy: string;
};

type Labels = {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  search: string;
  searchPlaceholder: string;
  platform: string;
  allPlatforms: string;
  sort: string;
  newest: string;
  recentlyPublished: string;
  mostViews: string;
  mostLikes: string;
  mostComments: string;
  results: string;
  filteredEmptyTitle: string;
  filteredEmptyDescription: string;
  openSource: string;
  createBrief: string;
  savedAt: string;
  collectionLabel: string;
  collectionNone: string;
  collectionError: string;
  views: string;
  likes: string;
  comments: string;
};

type SortKey = "newest" | "published" | "views" | "likes" | "comments";

function matchesSearch(row: ResearchEvidenceRow, query: string) {
  if (!query.trim()) return true;
  const haystack = [row.accountName, row.platform, row.mediaType, row.permalink]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query.trim().toLocaleLowerCase());
}

function sortRows(rows: ResearchEvidenceRow[], sort: SortKey) {
  return [...rows].sort((a, b) => {
    if (sort === "views" || sort === "likes" || sort === "comments") {
      return (b[sort] ?? -1) - (a[sort] ?? -1);
    }
    const aDate = sort === "published" ? a.publishedAt : a.savedAt;
    const bDate = sort === "published" ? b.publishedAt : b.savedAt;
    return (bDate ? Date.parse(bDate) : 0) - (aDate ? Date.parse(aDate) : 0);
  });
}

export function ResearchEvidenceGrid({
  workspaceSlug,
  slug,
  rows,
  canManage,
  collections,
  labels,
}: {
  workspaceSlug: string;
  slug: string;
  rows: ResearchEvidenceRow[];
  canManage: boolean;
  collections: Collection[];
  labels: Labels;
}) {
  const [query, setQuery] = React.useState("");
  const [platform, setPlatform] = React.useState("all");
  const [sort, setSort] = React.useState<SortKey>("newest");
  const platforms = React.useMemo(
    () => Array.from(new Set(rows.map((row) => row.platform))).sort(),
    [rows],
  );
  const visibleRows = React.useMemo(
    () =>
      sortRows(
        rows.filter(
          (row) => (platform === "all" || row.platform === platform) && matchesSearch(row, query),
        ),
        sort,
      ),
    [platform, query, rows, sort],
  );

  return (
    <section className="space-y-4" aria-labelledby="research-evidence-title">
      <div className="flex items-start gap-3">
        <Bookmark className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <h2
            id="research-evidence-title"
            className="text-title-card text-fg-primary font-semibold"
          >
            {labels.title}
          </h2>
          <p className="text-body text-fg-secondary mt-1">{labels.description}</p>
        </div>
      </div>

      {rows.length > 0 ? (
        <Card padding="md">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)_minmax(12rem,auto)] md:items-end">
            <label className="text-label text-fg-primary grid gap-1 font-semibold">
              <span>{labels.search}</span>
              <Input
                type="search"
                inputMode="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={labels.searchPlaceholder}
              />
            </label>
            <label className="text-label text-fg-primary grid min-h-11 gap-1 font-semibold">
              <span>{labels.platform}</span>
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
              >
                <option value="all">{labels.allPlatforms}</option>
                {platforms.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-label text-fg-primary grid min-h-11 gap-1 font-semibold">
              <span>{labels.sort}</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
              >
                <option value="newest">{labels.newest}</option>
                <option value="published">{labels.recentlyPublished}</option>
                <option value="views">{labels.mostViews}</option>
                <option value="likes">{labels.mostLikes}</option>
                <option value="comments">{labels.mostComments}</option>
              </select>
            </label>
          </div>
          <p className="text-label text-fg-muted mt-3" aria-live="polite">
            {labels.results.replace("{count}", String(visibleRows.length))}
          </p>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <Card variant="dashed" padding="lg">
          <h3 className="text-title-card text-fg-primary font-semibold">{labels.emptyTitle}</h3>
          <p className="text-body text-fg-secondary mt-1 max-w-2xl">{labels.emptyDescription}</p>
        </Card>
      ) : visibleRows.length === 0 ? (
        <Card variant="dashed" padding="lg">
          <h3 className="text-title-card text-fg-primary font-semibold">
            {labels.filteredEmptyTitle}
          </h3>
          <p className="text-body text-fg-secondary mt-1 max-w-2xl">
            {labels.filteredEmptyDescription}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleRows.map((row) => (
            <Card key={row.observationId} padding="md" className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-body text-fg-primary truncate font-semibold">
                    <bdi>{row.accountName || labels.emptyTitle}</bdi>
                  </h3>
                  <p className="text-label text-fg-muted mt-1 capitalize">
                    {row.platform} · {row.mediaType || "—"}
                    {row.publishedLabel ? ` · ${row.publishedLabel}` : ""}
                  </p>
                </div>
                <Badge variant="outline">{labels.savedAt.replace("{date}", row.savedLabel)}</Badge>
              </div>
              <dl className="text-label text-fg-secondary grid grid-cols-3 gap-2">
                <div>
                  <dt>{labels.views}</dt>
                  <dd className="text-fg-primary mt-0.5 font-semibold tabular-nums">
                    {row.viewsLabel}
                  </dd>
                </div>
                <div>
                  <dt>{labels.likes}</dt>
                  <dd className="text-fg-primary mt-0.5 font-semibold tabular-nums">
                    {row.likesLabel}
                  </dd>
                </div>
                <div>
                  <dt>{labels.comments}</dt>
                  <dd className="text-fg-primary mt-0.5 font-semibold tabular-nums">
                    {row.commentsLabel}
                  </dd>
                </div>
              </dl>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                {row.permalink ? (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={row.permalink} target="_blank" rel="noreferrer">
                      {labels.openSource}
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </Button>
                ) : null}
                <Button size="sm" asChild>
                  <a
                    href={`/app/w/${encodeURIComponent(slug)}/planning/new?researchPostObservationId=${encodeURIComponent(row.observationId)}`}
                  >
                    {labels.createBrief}
                  </a>
                </Button>
                {canManage ? (
                  <ResearchCollectionPicker
                    workspaceSlug={workspaceSlug}
                    itemKind="bookmark"
                    itemId={row.bookmarkId}
                    initialCollectionId={row.collectionId}
                    collections={collections}
                    label={labels.collectionLabel}
                    noCollection={labels.collectionNone}
                    errorLabel={labels.collectionError}
                  />
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
