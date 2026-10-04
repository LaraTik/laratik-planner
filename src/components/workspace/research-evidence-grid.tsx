"use client";

import * as React from "react";
import { ArrowUpRight, Bookmark, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ResearchCollectionPicker } from "@/components/workspace/research-collection-picker";
import {
  calculateResearchMetrics,
  formatResearchPercent,
  RESEARCH_METRICS_VERSION,
  type ResearchMetricInput,
} from "@/lib/research/metrics";

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
  reach?: number | null;
  likes: number | null;
  comments: number | null;
  saved?: number | null;
  shares?: number | null;
  interactions?: number | null;
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
  sortEngagement: string;
  sortOutlier: string;
  engagementRate: string;
  outlierScore: string;
  derivedMetric: string;
  peerSample: string;
  compare: string;
  compareSelected: string;
  compareTitle: string;
  compareDescription: string;
  clearComparison: string;
  filters: string;
  quickFilters: string;
  advancedFilters: string;
  noQuickFilter: string;
  mediumViews: string;
  highViews: string;
  highEngagement: string;
  outlierAtLeast: string;
  last3Months: string;
  last6Months: string;
  minViews: string;
  maxViews: string;
  minEngagement: string;
  maxEngagement: string;
  minOutlier: string;
  maxOutlier: string;
  resetFilters: string;
};

type SortKey = "newest" | "published" | "views" | "likes" | "comments" | "engagement" | "outlier";
type QuickFilter =
  | "none"
  | "mediumViews"
  | "highViews"
  | "highEngagement"
  | "outlier"
  | "last3Months"
  | "last6Months";

type FilterRange = {
  min: number | null;
  max: number | null;
};

function matchesSearch(row: ResearchEvidenceRow, query: string) {
  if (!query.trim()) return true;
  const haystack = [row.accountName, row.platform, row.mediaType, row.permalink]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query.trim().toLocaleLowerCase());
}

function asMetricInput(row: ResearchEvidenceRow): ResearchMetricInput {
  return {
    views: row.views,
    reach: row.reach,
    likes: row.likes,
    comments: row.comments,
    saved: row.saved,
    shares: row.shares,
    interactions: row.interactions,
  };
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function matchesRange(value: number | null | undefined, range: FilterRange) {
  if (range.min === null && range.max === null) return true;
  if (value === null || value === undefined) return false;
  return (range.min === null || value >= range.min) && (range.max === null || value <= range.max);
}

function matchesQuickFilter(row: ResearchEvidenceRow, quickFilter: QuickFilter) {
  if (quickFilter === "none") return true;
  if (quickFilter === "mediumViews")
    return row.views !== null && row.views >= 10_000 && row.views <= 100_000;
  if (quickFilter === "highViews") return row.views !== null && row.views >= 100_000;
  if (quickFilter === "highEngagement" || quickFilter === "outlier") return true;
  if (!row.publishedAt) return false;

  const publishedAt = Date.parse(row.publishedAt);
  if (!Number.isFinite(publishedAt)) return false;
  const months = quickFilter === "last3Months" ? 3 : 6;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return publishedAt >= cutoff.getTime();
}

function matchesFilters(
  row: ResearchEvidenceRow,
  derived: ReturnType<typeof calculateResearchMetrics> | undefined,
  quickFilter: QuickFilter,
  ranges: { views: FilterRange; engagement: FilterRange; outlier: FilterRange },
) {
  if (!matchesQuickFilter(row, quickFilter)) return false;
  const engagement = derived?.engagementRatePercent;
  const outlier = derived?.outlierScore;
  if (
    quickFilter === "highEngagement" &&
    (engagement === null || engagement === undefined || engagement < 3)
  )
    return false;
  if (quickFilter === "outlier" && (outlier === null || outlier === undefined || outlier < 1))
    return false;
  return (
    matchesRange(row.views, ranges.views) &&
    matchesRange(derived?.engagementRatePercent, ranges.engagement) &&
    matchesRange(derived?.outlierScore, ranges.outlier)
  );
}

function sortRows(
  rows: ResearchEvidenceRow[],
  sort: SortKey,
  metrics: Map<string, ReturnType<typeof calculateResearchMetrics>>,
) {
  return [...rows].sort((a, b) => {
    if (sort === "views" || sort === "likes" || sort === "comments") {
      return (b[sort] ?? -1) - (a[sort] ?? -1);
    }
    if (sort === "engagement") {
      return (
        (metrics.get(b.observationId)?.engagementRatePercent ?? -1) -
        (metrics.get(a.observationId)?.engagementRatePercent ?? -1)
      );
    }
    if (sort === "outlier") {
      return (
        (metrics.get(b.observationId)?.outlierScore ?? -1) -
        (metrics.get(a.observationId)?.outlierScore ?? -1)
      );
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
  const [quickFilter, setQuickFilter] = React.useState<QuickFilter>("none");
  const [minViews, setMinViews] = React.useState("");
  const [maxViews, setMaxViews] = React.useState("");
  const [minEngagement, setMinEngagement] = React.useState("");
  const [maxEngagement, setMaxEngagement] = React.useState("");
  const [minOutlier, setMinOutlier] = React.useState("");
  const [maxOutlier, setMaxOutlier] = React.useState("");
  const [selectedObservationIds, setSelectedObservationIds] = React.useState<string[]>([]);
  const metrics = React.useMemo(() => {
    const peerInputs = rows.map(asMetricInput);
    return new Map(
      rows.map((row) => [
        row.observationId,
        calculateResearchMetrics(asMetricInput(row), peerInputs),
      ]),
    );
  }, [rows]);
  const platforms = React.useMemo(
    () => Array.from(new Set(rows.map((row) => row.platform))).sort(),
    [rows],
  );
  const visibleRows = React.useMemo(
    () =>
      sortRows(
        rows.filter(
          (row) =>
            (platform === "all" || row.platform === platform) &&
            matchesSearch(row, query) &&
            matchesFilters(row, metrics.get(row.observationId), quickFilter, {
              views: { min: numberOrNull(minViews), max: numberOrNull(maxViews) },
              engagement: {
                min: numberOrNull(minEngagement),
                max: numberOrNull(maxEngagement),
              },
              outlier: { min: numberOrNull(minOutlier), max: numberOrNull(maxOutlier) },
            }),
        ),
        sort,
        metrics,
      ),
    [
      maxEngagement,
      maxOutlier,
      maxViews,
      metrics,
      minEngagement,
      minOutlier,
      minViews,
      platform,
      query,
      quickFilter,
      rows,
      sort,
    ],
  );
  const hasActiveFilters =
    quickFilter !== "none" ||
    [minViews, maxViews, minEngagement, maxEngagement, minOutlier, maxOutlier].some(Boolean);
  const resetFilters = () => {
    setQuickFilter("none");
    setMinViews("");
    setMaxViews("");
    setMinEngagement("");
    setMaxEngagement("");
    setMinOutlier("");
    setMaxOutlier("");
  };
  const selectedRows = React.useMemo(
    () => rows.filter((row) => selectedObservationIds.includes(row.observationId)),
    [rows, selectedObservationIds],
  );
  const toggleComparison = (observationId: string, checked: boolean) => {
    setSelectedObservationIds((current) => {
      if (checked) {
        return current.includes(observationId) || current.length >= 3
          ? current
          : [...current, observationId];
      }
      return current.filter((id) => id !== observationId);
    });
  };

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
                <option value="engagement">{labels.sortEngagement}</option>
                <option value="outlier">{labels.sortOutlier}</option>
              </select>
            </label>
          </div>
          <details className="border-border mt-4 rounded-[var(--radius-control)] border">
            <summary className="text-body text-fg-primary flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 font-semibold focus-visible:ring-2 focus-visible:outline-none">
              <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{labels.filters}</span>
              {hasActiveFilters ? <Badge variant="outline">{labels.advancedFilters}</Badge> : null}
            </summary>
            <div className="border-border space-y-4 border-t p-3">
              <fieldset className="space-y-2">
                <legend className="text-label text-fg-primary font-semibold">
                  {labels.quickFilters}
                </legend>
                <div className="flex flex-wrap gap-2" role="group" aria-label={labels.quickFilters}>
                  {(
                    [
                      ["none", labels.noQuickFilter],
                      ["mediumViews", labels.mediumViews],
                      ["highViews", labels.highViews],
                      ["highEngagement", labels.highEngagement],
                      ["outlier", labels.outlierAtLeast],
                      ["last3Months", labels.last3Months],
                      ["last6Months", labels.last6Months],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      variant={quickFilter === value ? "secondary" : "outline"}
                      size="sm"
                      aria-pressed={quickFilter === value}
                      onClick={() => setQuickFilter(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="text-label text-fg-primary font-semibold">
                  {labels.advancedFilters}
                </legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      [labels.minViews, minViews, setMinViews],
                      [labels.maxViews, maxViews, setMaxViews],
                      [labels.minEngagement, minEngagement, setMinEngagement],
                      [labels.maxEngagement, maxEngagement, setMaxEngagement],
                      [labels.minOutlier, minOutlier, setMinOutlier],
                      [labels.maxOutlier, maxOutlier, setMaxOutlier],
                    ] as const
                  ).map(([label, value, setValue]) => (
                    <label
                      key={label}
                      className="text-label text-fg-primary grid gap-1 font-semibold"
                    >
                      <span>{label}</span>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        className="h-11"
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!hasActiveFilters}
                onClick={resetFilters}
              >
                {labels.resetFilters}
              </Button>
            </div>
          </details>
          <p className="text-label text-fg-muted mt-3" aria-live="polite">
            {labels.results.replace("{count}", String(visibleRows.length))}
          </p>
          <p className="text-label text-fg-muted mt-1" aria-live="polite">
            {labels.compareSelected.replace("{count}", String(selectedRows.length))}
          </p>
        </Card>
      ) : null}

      {selectedRows.length > 0 ? (
        <Card padding="md" className="border-primary/30 bg-primary/5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-title-card text-fg-primary font-semibold">
                {labels.compareTitle}
              </h3>
              <p className="text-body text-fg-secondary mt-1">{labels.compareDescription}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelectedObservationIds([])}>
              {labels.clearComparison}
            </Button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {selectedRows.map((row) => {
              const derived = metrics.get(row.observationId);
              return (
                <div
                  key={row.observationId}
                  className="border-border bg-surface rounded-[var(--radius-card)] border p-3"
                >
                  <p className="text-body text-fg-primary truncate font-semibold">
                    <bdi>{row.accountName || labels.emptyTitle}</bdi>
                  </p>
                  <p className="text-label text-fg-muted mt-1 capitalize">
                    {row.platform} · {row.mediaType || "—"}
                  </p>
                  <dl className="text-label text-fg-secondary mt-3 grid grid-cols-2 gap-2">
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
                      <dt>{labels.engagementRate}</dt>
                      <dd className="text-fg-primary mt-0.5 font-semibold tabular-nums">
                        {formatResearchPercent(derived?.engagementRatePercent ?? null) ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>{labels.outlierScore}</dt>
                      <dd className="text-fg-primary mt-0.5 font-semibold tabular-nums">
                        {derived?.outlierScore !== null && derived?.outlierScore !== undefined
                          ? `${derived.outlierScore.toFixed(1)}x`
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
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
          {visibleRows.map((row) => {
            const derived = metrics.get(row.observationId);
            const engagement = formatResearchPercent(derived?.engagementRatePercent ?? null);
            return (
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
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <label className="text-label text-fg-secondary flex min-h-11 items-center gap-2">
                      <Checkbox
                        checked={selectedObservationIds.includes(row.observationId)}
                        disabled={
                          !selectedObservationIds.includes(row.observationId) &&
                          selectedObservationIds.length >= 3
                        }
                        onCheckedChange={(checked) =>
                          toggleComparison(row.observationId, checked === true)
                        }
                        aria-label={`${labels.compare}: ${row.accountName || labels.emptyTitle}`}
                      />
                      <span className="sr-only">{labels.compare}</span>
                    </label>
                    {derived?.outlierScore !== null && derived?.outlierScore !== undefined ? (
                      <Badge variant="success">
                        {labels.outlierScore} {derived.outlierScore.toFixed(1)}x
                      </Badge>
                    ) : null}
                    <Badge variant="outline">
                      {labels.savedAt.replace("{date}", row.savedLabel)}
                    </Badge>
                  </div>
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
                {engagement ||
                (derived?.outlierScore !== null && derived?.outlierScore !== undefined) ? (
                  <p className="text-label text-fg-muted flex flex-wrap gap-x-2 gap-y-1">
                    <span>
                      {labels.engagementRate}: {engagement ?? "—"}
                      {derived?.engagementPartial ? "*" : ""}
                    </span>
                    <span aria-label={`${labels.derivedMetric} ${RESEARCH_METRICS_VERSION}`}>
                      {labels.derivedMetric} {RESEARCH_METRICS_VERSION}
                    </span>
                    {derived && derived.peerSampleSize > 0 ? (
                      <span>
                        {labels.peerSample.replace("{count}", String(derived.peerSampleSize))}
                      </span>
                    ) : null}
                  </p>
                ) : null}
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
            );
          })}
        </div>
      )}
    </section>
  );
}
