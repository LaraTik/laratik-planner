"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ResearchBookmarkButton } from "@/components/workspace/research-bookmark-button";
import type { CommandCenterPost } from "@/lib/social/command-center";

type ObservedPost = CommandCenterPost & { outlierScore: number | null };
type Filter = "recent" | "views" | "outlier" | "engagement";

export type CommandCenterContentInventoryLabels = {
  title: string;
  description: string;
  recent: string;
  mostViewed: string;
  outlier: string;
  engagement: string;
  total: string;
  previous: string;
  next: string;
  page: string;
  noResults: string;
  openSource: string;
  createBrief: string;
  saveResearch: string;
  savedResearch: string;
  saveError: string;
  views: string;
  interactions: string;
  likes: string;
  comments: string;
};

// The reference Observed content card is a compact preview, not a full
// catalogue: six cards reads as a glanceable sample, where ten pushed the
// Top content and planning sections entirely below the fold.
const PAGE_SIZE = 6;

function metric(post: ObservedPost): number {
  return post.views ?? post.interactions ?? (post.likes ?? 0) + (post.comments ?? 0);
}

function formatNumber(value: number | null, locale: string): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat(locale, { numberingSystem: "latn", maximumFractionDigits: 0 }).format(
        value,
      );
}

export function CommandCenterContentInventory({
  posts,
  locale,
  workspaceSlug,
  savedResearchObservationIds,
  canSaveResearch,
  planningHref,
  labels,
}: {
  posts: ObservedPost[];
  locale: string;
  workspaceSlug: string;
  savedResearchObservationIds: ReadonlySet<string>;
  canSaveResearch: boolean;
  planningHref: string;
  labels: CommandCenterContentInventoryLabels;
}) {
  const [filter, setFilter] = React.useState<Filter>("recent");
  const [page, setPage] = React.useState(1);
  const filtered = React.useMemo(() => {
    const next = [...posts];
    if (filter === "views") {
      return next.sort((a, b) => metric(b) - metric(a));
    }
    if (filter === "outlier") {
      return next
        .filter((post) => (post.outlierScore ?? 0) >= 3)
        .sort((a, b) => (b.outlierScore ?? 0) - (a.outlierScore ?? 0));
    }
    if (filter === "engagement") {
      return next.sort((a, b) => (b.interactions ?? metric(b)) - (a.interactions ?? metric(a)));
    }
    return next.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  }, [filter, posts]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function selectFilter(next: Filter) {
    setFilter(next);
    setPage(1);
  }

  return (
    <Card
      id="command-center-inventory"
      data-testid="command-center-inventory"
      padding="md"
      className="space-y-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-title-card text-fg-primary font-semibold">{labels.title}</h3>
          <p className="text-label text-fg-secondary mt-1">{labels.description}</p>
        </div>
        <Badge variant="outline">
          {filtered.length} {labels.total}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={labels.title}>
        {(
          [
            ["recent", labels.recent],
            ["views", labels.mostViewed],
            ["outlier", labels.outlier],
            ["engagement", labels.engagement],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={filter === value ? "default" : "outline"}
            aria-pressed={filter === value}
            onClick={() => selectFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {visible.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((post) => (
            <article
              key={post.id}
              className="border-border bg-surface-subtle flex min-w-0 flex-col gap-3 rounded-[var(--radius-control)] border p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body text-fg-primary truncate font-semibold">
                    <bdi>{post.accountName}</bdi>
                  </p>
                  <p className="text-label text-fg-muted mt-1 capitalize">
                    {post.platform} · {post.mediaType}
                    {post.publishedAt
                      ? ` · ${new Intl.DateTimeFormat(locale, { dateStyle: "medium", numberingSystem: "latn" }).format(post.publishedAt)}`
                      : ""}
                  </p>
                </div>
                {post.outlierScore !== null && post.outlierScore >= 3 ? (
                  <Badge variant="success">{post.outlierScore.toFixed(1)}x</Badge>
                ) : null}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Metric label={labels.views} value={formatNumber(post.views, locale)} />
                <Metric
                  label={labels.interactions}
                  value={formatNumber(post.interactions, locale)}
                />
                <Metric
                  label={post.likes !== null ? labels.likes : labels.comments}
                  value={formatNumber(post.likes ?? post.comments, locale)}
                />
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                {post.permalink ? (
                  <a
                    href={post.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-label text-primary focus-visible:ring-focus-ring inline-flex min-h-9 items-center gap-1 rounded font-semibold focus:outline-none focus-visible:ring-2"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    {labels.openSource}
                  </a>
                ) : null}
                {canSaveResearch ? (
                  <ResearchBookmarkButton
                    workspaceSlug={workspaceSlug}
                    observationId={post.id}
                    initialSaved={savedResearchObservationIds.has(post.id)}
                    saveLabel={labels.saveResearch}
                    savedLabel={labels.savedResearch}
                    errorLabel={labels.saveError}
                  />
                ) : null}
                <Link
                  href={`${planningHref}/new?researchPostObservationId=${encodeURIComponent(post.id)}`}
                  className="text-label text-primary focus-visible:ring-focus-ring ms-auto inline-flex min-h-9 items-center gap-1 rounded font-semibold focus:outline-none focus-visible:ring-2"
                >
                  {labels.createBrief}
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-body text-fg-muted">{labels.noResults}</p>
      )}

      {filtered.length > 0 ? (
        <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <span className="text-label text-fg-muted">
            {labels.page} {safePage} / {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={safePage === 1}
              aria-label={labels.previous}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {labels.previous}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={safePage === totalPages}
              aria-label={labels.next}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              {labels.next}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-label text-fg-muted truncate">{label}</p>
      <p className="text-body text-fg-primary mt-0.5 font-semibold tabular-nums">{value}</p>
    </div>
  );
}
